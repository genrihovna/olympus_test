import React, { useMemo, useReducer, useState } from "react";
import archetypesData from "../modules/archetypes.json";
import archetypesI18n from "../modules/archetypes_i18n.json";
import questionsData from "../modules/questions.json";
import scoringData from "../modules/scoring_engine.json";
import uiTemplates from "../modules/ui_templates.json";
import localization from "../modules/localization.json";

function buildInitialScores(archetypes) {
  return Object.keys(archetypes).reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function fillTemplate(template, context) {
  if (!template) return "";
  return template.replace(/\{([^}]+)\}/g, (_, path) => {
    const value = path.split(".").reduce((acc, segment) => acc?.[segment], context);
    return value ?? "";
  });
}

function calculateResult(scores, archetypes, scoringRules) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const rulerId = sorted[0][0];
  const secondId = sorted[1][0];
  const thirdId = sorted[2][0];
  const lowestId = sorted[sorted.length - 1][0];

  const heroPool = (scoringRules.hero_archetypes || []).filter((id) => Object.prototype.hasOwnProperty.call(scores, id));
  const heroId = heroPool.sort((a, b) => scores[b] - scores[a] || a.localeCompare(b))[0] || rulerId;

  return {
    rulerId,
    councilIds: [secondId, thirdId],
    heroId,
    shadowDeficitId: lowestId,
    shadowExcess: archetypes[rulerId].shadow_excess,
  };
}

const initialState = {
  phase: "start",
  index: 0,
  questionAnimationKey: 0,
  responses: Array.from({ length: questionsData.questions.length }, () => null),
  visited: Array.from({ length: questionsData.questions.length }, () => false),
  scores: buildInitialScores(archetypesData.archetypes),
  result: null,
};

function buildScoresFromResponses(responses) {
  const scores = buildInitialScores(archetypesData.archetypes);

  responses.forEach((answerLetter, index) => {
    if (!answerLetter) return;
    const picked = questionsData.questions[index]?.answers?.[answerLetter];
    if (!picked) return;

    Object.entries(picked.scores).forEach(([archetype, points]) => {
      scores[archetype] = (scores[archetype] || 0) + points;
    });
  });

  return scores;
}

function reducer(state, action) {
  if (action.type === "START") {
    const visited = [...initialState.visited];
    visited[0] = true;
    return {
      ...initialState,
      phase: "question",
      visited,
    };
  }

  if (action.type === "ANSWER") {
    const current = questionsData.questions[state.index];
    const picked = current.answers[action.answer];
    if (!picked) return state;

    const responses = [...state.responses];
    const visited = [...state.visited];
    responses[state.index] = action.answer;
    visited[state.index] = true;
    const scores = buildScoresFromResponses(responses);
    const nextIndex = Math.min(questionsData.questions.length - 1, state.index + 1);
    visited[nextIndex] = true;

    return {
      ...state,
      responses,
      visited,
      scores,
      index: nextIndex,
      questionAnimationKey: state.questionAnimationKey + 1,
      result: null,
    };
  }

  if (action.type === "JUMP") {
    const targetIndex = Math.max(0, Math.min(questionsData.questions.length - 1, action.index));
    const visited = [...state.visited];
    visited[targetIndex] = true;

    return {
      ...state,
      phase: "question",
      index: targetIndex,
      visited,
      questionAnimationKey: state.questionAnimationKey + 1,
    };
  }

  if (action.type === "NEXT_UNANSWERED") {
    const firstAfterCurrent = state.responses.findIndex((value, index) => !value && index > state.index);
    const fallbackFirst = state.responses.findIndex((value) => !value);
    const targetIndex = firstAfterCurrent >= 0 ? firstAfterCurrent : fallbackFirst;
    if (targetIndex < 0) return state;

    const visited = [...state.visited];
    visited[targetIndex] = true;

    return {
      ...state,
      phase: "question",
      index: targetIndex,
      visited,
      questionAnimationKey: state.questionAnimationKey + 1,
    };
  }

  if (action.type === "SHOW_RESULT") {
    const hasUnanswered = state.responses.some((value) => !value);
    if (hasUnanswered) {
      return {
        ...state,
        phase: "review",
      };
    }

    return {
      ...state,
      phase: "result",
      result: calculateResult(state.scores, archetypesData.archetypes, scoringData.scoring_rules),
    };
  }

  if (action.type === "FINISH_ANYWAY") {
    return {
      ...state,
      phase: "result",
      result: calculateResult(state.scores, archetypesData.archetypes, scoringData.scoring_rules),
    };
  }

  if (action.type === "BACK_TO_QUESTIONS") {
    return {
      ...state,
      phase: "question",
    };
  }

  if (action.type === "RESTART") {
    return initialState;
  }

  return state;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [language, setLanguage] = useState("ru");
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [selectedArchetype, setSelectedArchetype] = useState(null);
  const templates = uiTemplates.output || {};
  const structure = templates.structure || {};
  const localizedUi = localization.ui[language] || localization.ui.ru;
  const localizedQuestionLabels = localization.question_labels[language] || localization.question_labels.ru;
  const localizedArchetypes = archetypesI18n[language] || {};
  const localizedStructures = localization.structure_templates?.[language] || {};
  const selectedStructure = {
    ruler: { template: localizedStructures.ruler || structure.ruler?.template },
    council: { template: localizedStructures.council || structure.council?.template },
    hero: { template: localizedStructures.hero || structure.hero?.template },
    shadow_excess: { template: localizedStructures.shadow_excess || structure.shadow_excess?.template },
    shadow_deficit: { template: localizedStructures.shadow_deficit || structure.shadow_deficit?.template },
  };
  const localizedQuestions = localization.questions?.[language] || {};

  const currentQuestion = state.phase === "question" ? questionsData.questions[state.index] : null;
  const answeredCount = state.responses.filter(Boolean).length;
  const skippedCount = state.responses.filter((answer, index) => !answer && state.visited[index]).length;
  const notVisitedCount = state.responses.length - answeredCount - skippedCount;
  const hasUnanswered = answeredCount < questionsData.questions.length;

  function getLocalizedArchetype(archetypeId) {
    const base = archetypesData.archetypes[archetypeId];
    const local = localizedArchetypes[archetypeId] || {};
    return {
      ...base,
      ...local,
      id: archetypeId,
      profile: local.profile || [
        `Сфера: ${base.domain}`,
        `Дар: ${base.gift}`,
        `Испытание: ${base.trial}`,
      ],
    };
  }

  function getQuestionStatus(index) {
    if (state.responses[index]) return "answered";
    if (state.visited[index]) return "skipped";
    return "not-visited";
  }

  const compactNavItems = useMemo(() => {
    const lastIndex = questionsData.questions.length - 1;
    const items = [];

    if (state.index > 1) {
      items.push({
        key: "left-ellipsis",
        label: "...",
        targetIndex: null,
        isEllipsis: true,
      });
    }

    if (state.index > 0) {
      const prevIndex = state.index - 1;
      items.push({
        key: questionsData.questions[prevIndex].id,
        label: localizedQuestionLabels[questionsData.questions[prevIndex].id] || questionsData.questions[prevIndex].id,
        targetIndex: prevIndex,
        isEllipsis: false,
      });
    }

    items.push({
      key: questionsData.questions[state.index].id,
      label: localizedQuestionLabels[questionsData.questions[state.index].id] || questionsData.questions[state.index].id,
      targetIndex: state.index,
      isEllipsis: false,
    });

    if (state.index < lastIndex) {
      const nextIndex = state.index + 1;
      items.push({
        key: questionsData.questions[nextIndex].id,
        label: localizedQuestionLabels[questionsData.questions[nextIndex].id] || questionsData.questions[nextIndex].id,
        targetIndex: nextIndex,
        isEllipsis: false,
      });
    }

    if (state.index < lastIndex - 1) {
      items.push({
        key: "right-ellipsis",
        label: "...",
        targetIndex: null,
        isEllipsis: true,
      });
    }

    return items;
  }, [localizedQuestionLabels, state.index]);

  const reading = useMemo(() => {
    if (!state.result) return null;

    const ruler = getLocalizedArchetype(state.result.rulerId);
    const councilSecond = getLocalizedArchetype(state.result.councilIds[0]);
    const councilThird = getLocalizedArchetype(state.result.councilIds[1]);
    const hero = getLocalizedArchetype(state.result.heroId);
    const deficit = getLocalizedArchetype(state.result.shadowDeficitId);

    return {
      rulerText: fillTemplate(selectedStructure.ruler?.template, { archetype: ruler }),
      councilText: fillTemplate(selectedStructure.council?.template, {
        archetype_2: councilSecond,
        archetype_3: councilThird,
      }),
      heroText: fillTemplate(selectedStructure.hero?.template, { hero }),
      shadowExcessText: fillTemplate(selectedStructure.shadow_excess?.template, {
        top_archetype: ruler,
        shadow: ruler.shadow_excess,
      }),
      shadowDeficitText: fillTemplate(selectedStructure.shadow_deficit?.template, { archetype: deficit }),
      ruler,
      councilSecond,
      councilThird,
      hero,
      deficit,
    };
  }, [localizedArchetypes, selectedStructure, state.result]);

  return (
    <div className="app">
      <div className="backdrop" />
      <main className="panel">
        <div className="language-switcher">
          <span>{localizedUi.language_label}</span>
          {Object.entries(localization.languages).map(([code, title]) => (
            <button
              key={code}
              type="button"
              className={`language-btn ${language === code ? "active" : ""}`}
              onClick={() => setLanguage(code)}
            >
              {title}
            </button>
          ))}
        </div>
        <h1>{localizedUi.title}</h1>

        {state.phase === "start" && (
          <section className="card intro">
            <p>{localizedUi.start_subtitle}</p>
            <button
              className="cta"
              onClick={() => {
                setShowAllQuestions(false);
                dispatch({ type: "START" });
              }}
            >
              {localizedUi.start_button}
            </button>
          </section>
        )}

        {state.phase === "question" && currentQuestion && (
          <section key={state.questionAnimationKey} className="card question-card fade-in">
            <p className="progress">
              {localizedUi.progress_label} {state.index + 1} / {questionsData.questions.length}
            </p>
            <div className="summary-row">
              <span className="status-pill answered">{localizedUi.answered_label}: {answeredCount}</span>
              <span className="status-pill skipped">{localizedUi.skipped_label}: {skippedCount}</span>
              <span className="status-pill not-visited">{localizedUi.not_visited_label}: {notVisitedCount}</span>
            </div>
            <h2>{localizedQuestions[currentQuestion.id]?.text || currentQuestion.text}</h2>
            <div className="question-actions">
              <button type="button" className="secondary-btn" onClick={() => dispatch({ type: "NEXT_UNANSWERED" })}>
                {localizedUi.next_unanswered_button}
              </button>
              <button type="button" className="secondary-btn" onClick={() => setShowAllQuestions((value) => !value)}>
                {localizedUi.review_button}
              </button>
              <button type="button" className="secondary-btn" onClick={() => dispatch({ type: "SHOW_RESULT" })}>
                {localizedUi.show_result_button}
              </button>
            </div>
            <div className="answers">
              {Object.entries(currentQuestion.answers).map(([letter, answer]) => (
                <button
                  key={letter}
                  className={`answer-btn ${state.responses[state.index] === letter ? "selected" : ""}`}
                  onClick={() => dispatch({ type: "ANSWER", answer: letter })}
                >
                  <span>{letter}</span>
                  {localizedQuestions[currentQuestion.id]?.answers?.[letter] || answer.text}
                </button>
              ))}
            </div>
            <div className="question-jump-bottom">
              {compactNavItems.map((item) => {
                const isActive = state.index === item.targetIndex && !item.isEllipsis;
                const isAnswered = item.isEllipsis ? false : getQuestionStatus(item.targetIndex) === "answered";
                const isSkipped = item.isEllipsis ? false : getQuestionStatus(item.targetIndex) === "skipped";

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`jump-btn ${isActive ? "active" : ""} ${isAnswered ? "answered" : ""} ${isSkipped ? "skipped" : ""} ${item.isEllipsis ? "ellipsis-btn" : ""}`}
                    onClick={() => {
                      if (item.isEllipsis) {
                        setShowAllQuestions(true);
                        return;
                      }
                      dispatch({ type: "JUMP", index: item.targetIndex });
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {showAllQuestions && (
              <div className="all-questions-panel">
                {questionsData.questions.map((question, index) => {
                  const status = getQuestionStatus(index);
                  const isActive = state.index === index;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      className={`jump-btn ${isActive ? "active" : ""} ${status}`}
                      onClick={() => dispatch({ type: "JUMP", index })}
                    >
                      {localizedQuestionLabels[question.id] || question.id}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {state.phase === "review" && (
          <section className="card result-card fade-in">
            <h2>{localizedUi.review_title}</h2>
            <p>{localizedUi.review_subtitle}</p>
            <div className="summary-row">
              <span className="status-pill answered">{localizedUi.answered_label}: {answeredCount}</span>
              <span className="status-pill skipped">{localizedUi.skipped_label}: {skippedCount}</span>
              <span className="status-pill not-visited">{localizedUi.not_visited_label}: {notVisitedCount}</span>
            </div>
            <div className="all-questions-panel">
              {questionsData.questions.map((question, index) => {
                const status = getQuestionStatus(index);
                return (
                  <button
                    key={question.id}
                    type="button"
                    className={`jump-btn ${status}`}
                    onClick={() => dispatch({ type: "JUMP", index })}
                  >
                    {localizedQuestionLabels[question.id] || question.id}
                  </button>
                );
              })}
            </div>
            <button className="secondary-btn" onClick={() => dispatch({ type: "NEXT_UNANSWERED" })}>
              {localizedUi.go_first_unanswered_button}
            </button>
            <button className="secondary-btn" onClick={() => dispatch({ type: "BACK_TO_QUESTIONS" })}>
              {localizedUi.back_to_questions_button}
            </button>
            <button className="cta" onClick={() => dispatch({ type: "FINISH_ANYWAY" })}>
              {hasUnanswered ? localizedUi.finish_anyway_button : localizedUi.show_result_button}
            </button>
          </section>
        )}

        {state.phase === "result" && reading && (
          <section className="card result-card fade-in">
            <h2>{localizedUi.result_title}</h2>
            <p className="hint-line">{localizedUi.archetype_hint}</p>
            <p className="oracle-line">
              <strong>{localizedUi.ruler_label}</strong>{" "}
              <button type="button" className="archetype-link" onClick={() => setSelectedArchetype(reading.ruler)}>
                {reading.ruler.name}
              </button>
            </p>
            <p>{reading.rulerText}</p>
            <p className="oracle-line">
              <strong>{localizedUi.council_label}</strong>{" "}
              <button type="button" className="archetype-link" onClick={() => setSelectedArchetype(reading.councilSecond)}>
                {reading.councilSecond.name}
              </button>{" "}
              +{" "}
              <button type="button" className="archetype-link" onClick={() => setSelectedArchetype(reading.councilThird)}>
                {reading.councilThird.name}
              </button>
            </p>
            <p>{reading.councilText}</p>
            <p className="oracle-line">
              <strong>{localizedUi.hero_label}</strong>{" "}
              <button type="button" className="archetype-link" onClick={() => setSelectedArchetype(reading.hero)}>
                {reading.hero.name}
              </button>
            </p>
            <p>{reading.heroText}</p>
            <p className="oracle-line">
              <strong>{localizedUi.shadow_excess_label}</strong> {reading.ruler.shadow_excess}
            </p>
            <p>{reading.shadowExcessText}</p>
            <p className="oracle-line">
              <strong>{localizedUi.shadow_deficit_label}</strong>{" "}
              <button type="button" className="archetype-link" onClick={() => setSelectedArchetype(reading.deficit)}>
                {reading.deficit.name}
              </button>
            </p>
            <p>{reading.shadowDeficitText}</p>
            <button
              className="cta"
              onClick={() => {
                setShowAllQuestions(false);
                dispatch({ type: "RESTART" });
              }}
            >
              {localizedUi.restart_button}
            </button>
          </section>
        )}
      </main>
      {selectedArchetype && (
        <div className="modal-overlay" onClick={() => setSelectedArchetype(null)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>{selectedArchetype.name}</h3>
            <ul>
              {selectedArchetype.profile.slice(0, 3).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="secondary-btn" onClick={() => setSelectedArchetype(null)}>
              {localizedUi.close_button}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
