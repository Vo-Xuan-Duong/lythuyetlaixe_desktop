import { describe, expect, it } from "vitest";
import type { ExamSession } from "../entities/exam";
import type { LicenseType, Question } from "../entities/question";
import { createExamSession, remainingExamSeconds, scoreExam, selectExamQuestions } from "./examEngine";
import { resolveExamConfig } from "./examConfigs";

const LICENSES: LicenseType[] = ["B"];

function question(
  id: number,
  categoryCode: string,
  options: { critical?: boolean } = {},
): Question {
  return {
    id,
    categoryCode,
    content: `Question ${id}`,
    critical: options.critical ?? false,
    licenses: LICENSES,
    answers: [
      { key: "A", content: "Correct", correct: true },
      { key: "B", content: "Wrong", correct: false },
    ],
    sourceVersion: "2025.06",
  };
}

function buildBPool(): Question[] {
  const result: Question[] = [];
  let id = 1;

  const add = (categoryCode: string, count: number) => {
    for (let index = 0; index < count; index += 1) {
      result.push(question(id, categoryCode));
      id += 1;
    }
  };

  add("GENERAL_RULES", 20);
  add("CULTURE", 5);
  add("DRIVING_TECHNIQUE", 5);
  add("VEHICLE", 5);
  add("ROAD_SIGNS", 20);
  add("SITUATIONS", 20);

  for (let index = 0; index < 5; index += 1) {
    result.push(question(id, "GENERAL_RULES", { critical: true }));
    id += 1;
  }

  return result;
}

describe("exam config resolver", () => {
  it("resolves the current B configuration during the transition period", () => {
    const config = resolveExamConfig("B", "2026-08-30");

    expect(config).not.toBeNull();
    expect(config?.questionCount).toBe(30);
    expect(config?.durationSeconds).toBe(20 * 60);
    expect(config?.passingScore).toBe(27);
    expect(config?.criticalQuestionCount).toBe(1);
    expect(config?.failOnWrongCriticalQuestion).toBe(true);
  });

  it("does not pretend the 2025.06 dataset is a valid 2027 exam format", () => {
    expect(resolveExamConfig("B", "2027-03-01")).toBeNull();
  });
});

describe("exam question selection", () => {
  it("selects the official B quotas with exactly one critical question", () => {
    const config = resolveExamConfig("B", "2026-08-30");
    if (!config) throw new Error("B config not found");

    const selected = selectExamQuestions(buildBPool(), config, () => 0.42);
    const regular = selected.filter((item) => !item.critical);

    expect(selected).toHaveLength(30);
    expect(new Set(selected.map((item) => item.id)).size).toBe(30);
    expect(selected.filter((item) => item.critical)).toHaveLength(1);
    expect(regular.filter((item) => item.categoryCode === "GENERAL_RULES")).toHaveLength(8);
    expect(regular.filter((item) => item.categoryCode === "CULTURE")).toHaveLength(1);
    expect(regular.filter((item) => item.categoryCode === "DRIVING_TECHNIQUE")).toHaveLength(1);
    expect(regular.filter((item) => item.categoryCode === "VEHICLE")).toHaveLength(1);
    expect(regular.filter((item) => item.categoryCode === "ROAD_SIGNS")).toHaveLength(9);
    expect(regular.filter((item) => item.categoryCode === "SITUATIONS")).toHaveLength(9);
  });

  it("fails explicitly when a category has too few candidates", () => {
    const config = resolveExamConfig("B", "2026-08-30");
    if (!config) throw new Error("B config not found");

    const undersized = buildBPool().filter((item) => item.categoryCode !== "ROAD_SIGNS");
    expect(() => selectExamQuestions(undersized, config, () => 0.1)).toThrow(/Not enough candidates/);
  });
});

describe("exam scoring", () => {
  it("fails an otherwise passing result when the critical question is wrong", () => {
    const config = resolveExamConfig("B", "2026-08-30");
    if (!config) throw new Error("B config not found");

    const session = createExamSession(buildBPool(), config, {
      random: () => 0.42,
      startedAt: new Date("2026-08-30T12:00:00.000Z"),
    });
    const critical = session.questions.find((item) => item.question.critical);
    if (!critical) throw new Error("Critical question not selected");

    const answers: Record<number, string> = {};
    for (const item of session.questions) answers[item.question.id] = "A";
    answers[critical.question.id] = "B";

    const result = scoreExam(session, answers);

    expect(result.score).toBe(29);
    expect(result.criticalFailed).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("passes when score threshold is met and the critical question is correct", () => {
    const config = resolveExamConfig("B", "2026-08-30");
    if (!config) throw new Error("B config not found");

    const session = createExamSession(buildBPool(), config, { random: () => 0.42 });
    const answers: Record<number, string> = {};
    for (const item of session.questions) answers[item.question.id] = "A";

    const result = scoreExam(session, answers);
    expect(result.score).toBe(30);
    expect(result.criticalFailed).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("treats unanswered critical questions as a critical failure", () => {
    const config = resolveExamConfig("B", "2026-08-30");
    if (!config) throw new Error("B config not found");

    const session = createExamSession(buildBPool(), config, { random: () => 0.42 });
    const answers: Record<number, string> = {};
    for (const item of session.questions) {
      if (!item.question.critical) answers[item.question.id] = "A";
    }

    const result = scoreExam(session, answers);
    expect(result.unansweredCount).toBe(1);
    expect(result.criticalFailed).toBe(true);
    expect(result.passed).toBe(false);
  });
});

describe("exam timer", () => {
  it("returns remaining seconds and never goes negative", () => {
    const config = resolveExamConfig("B", "2026-08-30");
    if (!config) throw new Error("B config not found");

    const session: ExamSession = {
      config,
      questions: [],
      startedAt: "2026-08-30T12:00:00.000Z",
    };

    expect(remainingExamSeconds(session, new Date("2026-08-30T12:05:00.000Z"))).toBe(15 * 60);
    expect(remainingExamSeconds(session, new Date("2026-08-30T13:00:00.000Z"))).toBe(0);
  });
});
