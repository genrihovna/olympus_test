import React, { useMemo, useReducer } from "react";
import archetypesData from "../modules/archetypes.json";
import questionsData from "../modules/questions.json";
import scoringData from "../modules/scoring_engine.json";
import uiTemplates from "../modules/ui_templates.json";

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
  scores: buildInitialScores(archetypesData.archetypes),
  result: null,
};

function reducer(state, action) {
  if (action.type === "START") {
    return {
      ...initialState,
      phase: "question",
    };
  }

  if (action.type === "ANSWER") {
    const current = questionsData.questions[state.index];
    const picked = current.answers[action.answer];
    if (!picked) return state;
    const updatedScores = { ...state.scores };

    Object.entries(picked.scores).forEach(([archetype, points]) => {
      updatedScores[archetype] = (updatedScores[archetype] || 0) + points;
    });

    const isLast = state.index >= questionsData.questions.length - 1;
    if (isLast) {
      return {
        ...state,
        scores: updatedScores,
        phase: "result",
        result: calculateResult(updatedScores, archetypesData.archetypes, scoringData.scoring_rules),
      };
    }

    return {
      ...state,
      scores: updatedScores,
      index: state.index + 1,
      questionAnimationKey: state.questionAnimationKey + 1,
    };
  }

  if (action.type === "RESTART") {
    return initialState;
  }

  return state;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const templates = uiTemplates.output || {};
  const structure = templates.structure || {};
  const meta = templates.meta || {};

  const currentQuestion = state.phase === "question" ? questionsData.questions[state.index] : null;

  const reading = useMemo(() => {
    if (!state.result) return null;

    const ruler = archetypesData.archetypes[state.result.rulerId];
    const councilSecond = archetypesData.archetypes[state.result.councilIds[0]];
    const councilThird = archetypesData.archetypes[state.result.councilIds[1]];
    const hero = archetypesData.archetypes[state.result.heroId];
    const deficit = archetypesData.archetypes[state.result.shadowDeficitId];

    return {
      rulerText: fillTemplate(structure.ruler?.template, { archetype: ruler }),
      councilText: fillTemplate(structure.council?.template, {
        archetype_2: councilSecond,
        archetype_3: councilThird,
      }),
      heroText: fillTemplate(structure.hero?.template, { hero }),
      shadowExcessText: fillTemplate(structure.shadow_excess?.template, {
        top_archetype: ruler,
        shadow: state.result.shadowExcess,
      }),
      shadowDeficitText: fillTemplate(structure.shadow_deficit?.template, { archetype: deficit }),
      ruler,
      councilSecond,
      councilThird,
      hero,
      deficit,
    };
  }, [state.result, structure]);

  return (
    <div className="app">
      <div className="backdrop" />
      <main className="panel">
        <h1>{meta.title || "Mythic Olympus Personality Test"}</h1>

        {state.phase === "start" && (
          <section className="card intro">
            <p>{meta.start_subtitle || "Оракул Олимпа готов открыть твой внутренний пантеон."}</p>
            <button className="cta" onClick={() => dispatch({ type: "START" })}>
              {meta.start_button || "Начать тест"}
            </button>
          </section>
        )}

        {state.phase === "question" && currentQuestion && (
          <section key={state.questionAnimationKey} className="card question-card fade-in">
            <p className="progress">
              Вопрос {state.index + 1} / {questionsData.questions.length}
            </p>
            <h2>{currentQuestion.text}</h2>
            <div className="answers">
              {Object.entries(currentQuestion.answers).map(([letter, answer]) => (
                <button
                  key={letter}
                  className="answer-btn"
                  onClick={() => dispatch({ type: "ANSWER", answer: letter })}
                >
                  <span>{letter}</span>
                  {answer.text}
                </button>
              ))}
            </div>
          </section>
        )}

        {state.phase === "result" && reading && (
          <section className="card result-card fade-in">
            <h2>{meta.result_title || "Чтение Оракула"}</h2>
            <p className="oracle-line">
              <strong>Правитель:</strong> {reading.ruler.name}
            </p>
            <p>{reading.rulerText}</p>
            <p className="oracle-line">
              <strong>Совет:</strong> {reading.councilSecond.name} + {reading.councilThird.name}
            </p>
            <p>{reading.councilText}</p>
            <p className="oracle-line">
              <strong>Герой:</strong> {reading.hero.name}
            </p>
            <p>{reading.heroText}</p>
            <p className="oracle-line">
              <strong>Избыток тени:</strong> {state.result.shadowExcess}
            </p>
            <p>{reading.shadowExcessText}</p>
            <p className="oracle-line">
              <strong>Недостаток тени:</strong> {reading.deficit.name}
            </p>
            <p>{reading.shadowDeficitText}</p>
            <button className="cta" onClick={() => dispatch({ type: "RESTART" })}>
            {meta.restart_button || "Пройти снова"}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
