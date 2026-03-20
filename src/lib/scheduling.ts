import { addDays, addMinutes } from "date-fns";
import type { ReviewRating, ReviewRecord, ReviewStateKind } from "@/lib/types";

export const DEFAULT_EASE_FACTOR = 2.5;

export function createDefaultReview(cardId: string, userId: string, dueAt = new Date()): ReviewRecord {
  const now = new Date().toISOString();

  return {
    cardId,
    userId,
    state: "new",
    dueAt: dueAt.toISOString(),
    intervalDays: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
    updatedAt: now,
  };
}

function nextLearningState(current: ReviewStateKind, rating: ReviewRating): ReviewStateKind {
  if (rating === "again") {
    return "learning";
  }

  if (current === "new" && rating === "hard") {
    return "learning";
  }

  return "review";
}

export function scheduleReview(previous: ReviewRecord, rating: ReviewRating, now = new Date()): ReviewRecord {
  let state = previous.state;
  let intervalDays = previous.intervalDays;
  let easeFactor = previous.easeFactor;
  let repetitions = previous.repetitions;
  let lapses = previous.lapses;
  let dueAt = now;

  if (previous.state === "new" || previous.state === "learning") {
    state = nextLearningState(previous.state, rating);

    switch (rating) {
      case "again":
        intervalDays = 0;
        dueAt = addMinutes(now, 10);
        lapses += 1;
        easeFactor = Math.max(1.3, easeFactor - 0.2);
        break;
      case "hard":
        intervalDays = 1;
        dueAt = addDays(now, 1);
        easeFactor = Math.max(1.4, easeFactor - 0.15);
        repetitions = Math.max(1, repetitions + 1);
        break;
      case "good":
        intervalDays = previous.state === "new" ? 2 : 3;
        dueAt = addDays(now, intervalDays);
        repetitions += 1;
        break;
      case "easy":
        intervalDays = previous.state === "new" ? 4 : 5;
        dueAt = addDays(now, intervalDays);
        repetitions += 1;
        easeFactor = Math.min(3.0, easeFactor + 0.15);
        break;
    }
  } else {
    switch (rating) {
      case "again":
        state = "learning";
        intervalDays = 1;
        dueAt = addDays(now, 1);
        easeFactor = Math.max(1.3, easeFactor - 0.2);
        repetitions = Math.max(0, repetitions - 1);
        lapses += 1;
        break;
      case "hard":
        state = "review";
        intervalDays = Math.max(2, Math.round(previous.intervalDays * 1.2));
        dueAt = addDays(now, intervalDays);
        easeFactor = Math.max(1.35, easeFactor - 0.12);
        repetitions += 1;
        break;
      case "good":
        state = "review";
        intervalDays = Math.max(2, Math.round(previous.intervalDays * previous.easeFactor));
        dueAt = addDays(now, intervalDays);
        repetitions += 1;
        break;
      case "easy":
        state = "review";
        intervalDays = Math.max(3, Math.round(previous.intervalDays * previous.easeFactor * 1.25));
        dueAt = addDays(now, intervalDays);
        easeFactor = Math.min(3.0, easeFactor + 0.15);
        repetitions += 1;
        break;
    }
  }

  return {
    ...previous,
    state,
    intervalDays,
    easeFactor,
    repetitions,
    lapses,
    dueAt: dueAt.toISOString(),
    lastReviewedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
