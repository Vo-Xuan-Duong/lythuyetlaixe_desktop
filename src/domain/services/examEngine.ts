import type { ExamConfig, ExamResult, ExamSession } from "../entities/exam";
import type { Question } from "../entities/question";
import { validateExamConfig } from "./examConfigs";

export type RandomSource = () => number;

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function takeRandom<T>(items: readonly T[], count: number, random: RandomSource): T[] {
  if (items.length < count) {
    throw new Error(`Not enough candidates: requested ${count}, found ${items.length}`);
  }
  return shuffle(items, random).slice(0, count);
}

export function selectExamQuestions(
  questions: readonly Question[],
  config: ExamConfig,
  random: RandomSource = Math.random,
): Question[] {
  validateExamConfig(config);

  const eligible = questions.filter(
    (question) =>
      question.sourceVersion === config.datasetVersion &&
      question.licenses.includes(config.licenseType),
  );

  const selected: Question[] = [];
  const selectedIds = new Set<number>();

  const criticalPool = eligible.filter((question) => question.critical);
  const criticalQuestions = takeRandom(criticalPool, config.criticalQuestionCount, random);
  for (const question of criticalQuestions) {
    selected.push(question);
    selectedIds.add(question.id);
  }

  for (const quota of config.categoryQuotas) {
    const pool = eligible.filter(
      (question) =>
        !question.critical &&
        !selectedIds.has(question.id) &&
        question.categoryCode === quota.categoryCode,
    );

    const picked = takeRandom(pool, quota.count, random);
    for (const question of picked) {
      selected.push(question);
      selectedIds.add(question.id);
    }
  }

  if (selected.length !== config.questionCount) {
    throw new Error(
      `Exam selection produced ${selected.length} questions, expected ${config.questionCount}`,
    );
  }

  return shuffle(selected, random);
}

export function createExamSession(
  questions: readonly Question[],
  config: ExamConfig,
  options: { random?: RandomSource; startedAt?: Date } = {},
): ExamSession {
  const selected = selectExamQuestions(questions, config, options.random ?? Math.random);
  return {
    config,
    questions: selected.map((question) => ({ question })),
    startedAt: (options.startedAt ?? new Date()).toISOString(),
  };
}

export function scoreExam(
  session: ExamSession,
  answers: Readonly<Record<number, string | undefined>>,
): ExamResult {
  const answerResults = session.questions.map(({ question }) => {
    const correctAnswer = question.answers.find((answer) => answer.correct);
    if (!correctAnswer) {
      throw new Error(`Question ${question.id} has no correct answer`);
    }

    const selectedAnswerKey = answers[question.id];
    return {
      questionId: question.id,
      selectedAnswerKey,
      correctAnswerKey: correctAnswer.key,
      correct: selectedAnswerKey === correctAnswer.key,
      critical: question.critical,
    };
  });

  const correctCount = answerResults.filter((item) => item.correct).length;
  const answeredCount = answerResults.filter((item) => item.selectedAnswerKey !== undefined).length;
  const unansweredCount = session.config.questionCount - answeredCount;
  const wrongCount = session.config.questionCount - correctCount - unansweredCount;
  const criticalFailed =
    session.config.failOnWrongCriticalQuestion &&
    answerResults.some((item) => item.critical && !item.correct);
  const passed = correctCount >= session.config.passingScore && !criticalFailed;

  return {
    score: correctCount,
    questionCount: session.config.questionCount,
    passingScore: session.config.passingScore,
    passed,
    criticalFailed,
    answeredCount,
    correctCount,
    wrongCount,
    unansweredCount,
    answers: answerResults,
  };
}

export function remainingExamSeconds(
  session: ExamSession,
  now: Date = new Date(),
): number {
  const startedAt = new Date(session.startedAt).getTime();
  if (Number.isNaN(startedAt)) throw new Error("Invalid exam session startedAt");

  const elapsedSeconds = Math.floor((now.getTime() - startedAt) / 1000);
  return Math.max(0, session.config.durationSeconds - elapsedSeconds);
}
