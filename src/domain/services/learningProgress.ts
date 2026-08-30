import type { MasteryLevel, QuestionProgress } from "../entities/progress";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WRONG_ANSWER_REVIEW_DELAY = 10 * MINUTE_MS;

const CORRECT_REVIEW_DELAYS_BY_MASTERY: Record<MasteryLevel, number> = {
  0: 10 * MINUTE_MS,
  1: 1 * DAY_MS,
  2: 3 * DAY_MS,
  3: 7 * DAY_MS,
  4: 14 * DAY_MS,
};

export interface RecordAnswerInput {
  questionId: number;
  correct: boolean;
  previous?: QuestionProgress | null;
  answeredAt?: Date;
}

function clampMastery(value: number): MasteryLevel {
  return Math.max(0, Math.min(4, value)) as MasteryLevel;
}

export function nextMastery(current: MasteryLevel, correct: boolean): MasteryLevel {
  return clampMastery(correct ? current + 1 : current - 1);
}

export function nextReviewAt(mastery: MasteryLevel, correct: boolean, answeredAt: Date): string {
  const delay = correct
    ? CORRECT_REVIEW_DELAYS_BY_MASTERY[mastery]
    : WRONG_ANSWER_REVIEW_DELAY;
  return new Date(answeredAt.getTime() + delay).toISOString();
}

export function recordAnswerProgress({
  questionId,
  correct,
  previous,
  answeredAt = new Date(),
}: RecordAnswerInput): QuestionProgress {
  const currentMastery = previous?.mastery ?? 0;
  const mastery = nextMastery(currentMastery, correct);

  return {
    questionId,
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    correctCount: (previous?.correctCount ?? 0) + (correct ? 1 : 0),
    wrongCount: (previous?.wrongCount ?? 0) + (correct ? 0 : 1),
    mastery,
    lastAnsweredAt: answeredAt.toISOString(),
    nextReviewAt: nextReviewAt(mastery, correct, answeredAt),
  };
}

export function accuracyPercent(progress: QuestionProgress | null | undefined): number {
  if (!progress || progress.attemptCount <= 0) return 0;
  return Math.round((progress.correctCount / progress.attemptCount) * 100);
}
