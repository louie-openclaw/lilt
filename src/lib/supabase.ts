import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createDefaultReview } from "@/lib/scheduling";
import type {
  AppSession,
  AppUser,
  CardRecord,
  DeckNode,
  ReviewRecord,
  StudyEvent,
  WorkspaceData,
} from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl!, supabaseAnonKey!);
  }

  return browserClient;
}

export function toAppSession(session: Session): AppSession {
  const user = session.user;

  return {
    mode: "supabase",
    user: {
      id: user.id,
      name:
        user.user_metadata.full_name ??
        user.user_metadata.name ??
        user.email?.split("@")[0] ??
        "Learner",
      email: user.email ?? "",
      avatarUrl: user.user_metadata.avatar_url ?? null,
    },
  };
}

function normalizeDeck(row: Record<string, unknown>): DeckNode {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    kind: row.kind === "folder" ? "folder" : "deck",
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    color: String(row.color ?? "#f29cb6"),
    position: Number(row.position ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeCard(row: Record<string, unknown>): CardRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deckId: String(row.deck_id),
    frontHtml: String(row.front_html ?? ""),
    backHtml: String(row.back_html ?? ""),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function normalizeReview(row: Record<string, unknown>): ReviewRecord {
  return {
    cardId: String(row.card_id),
    userId: String(row.user_id),
    state: row.state === "review" ? "review" : row.state === "learning" ? "learning" : "new",
    dueAt: String(row.due_at),
    intervalDays: Number(row.interval_days ?? 0),
    easeFactor: Number(row.ease_factor ?? 2.5),
    repetitions: Number(row.repetitions ?? 0),
    lapses: Number(row.lapses ?? 0),
    lastReviewedAt: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    updatedAt: String(row.updated_at),
  };
}

function normalizeStudyEvent(row: Record<string, unknown>): StudyEvent {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    cardId: String(row.card_id),
    deckId: String(row.deck_id),
    rating:
      row.rating === "easy"
        ? "easy"
        : row.rating === "hard"
          ? "hard"
          : row.rating === "good"
            ? "good"
            : "again",
    previousState:
      row.previous_state === "review"
        ? "review"
        : row.previous_state === "learning"
          ? "learning"
          : "new",
    studiedAt: String(row.studied_at),
    nextDueAt: String(row.next_due_at),
  };
}

export async function loadSupabaseWorkspace(currentUser: AppUser): Promise<WorkspaceData> {
  const client = getSupabaseBrowserClient();

  if (!client) {
    throw new Error("Supabase is not configured.");
  }

  const [decksRes, cardsRes, reviewsRes, eventsRes] = await Promise.all([
    client.from("decks").select("*").order("position", { ascending: true }),
    client.from("cards").select("*").order("updated_at", { ascending: false }),
    client.from("review_states").select("*"),
    client.from("study_events").select("*").order("studied_at", { ascending: false }).limit(200),
  ]);

  if (decksRes.error || cardsRes.error || reviewsRes.error || eventsRes.error) {
    throw new Error(
      decksRes.error?.message ??
        cardsRes.error?.message ??
        reviewsRes.error?.message ??
        eventsRes.error?.message ??
        "Unable to load workspace.",
    );
  }

  const cards = (cardsRes.data ?? []).map((row) => normalizeCard(row as Record<string, unknown>));
  const reviewEntries = (reviewsRes.data ?? []).map((row) => normalizeReview(row as Record<string, unknown>));
  const reviews = Object.fromEntries(reviewEntries.map((entry) => [entry.cardId, entry]));

  for (const card of cards) {
    if (!reviews[card.id]) {
      reviews[card.id] = createDefaultReview(card.id, currentUser.id);
    }
  }

  return {
    decks: (decksRes.data ?? []).map((row) => normalizeDeck(row as Record<string, unknown>)),
    cards,
    reviews,
    studyEvents: (eventsRes.data ?? []).map((row) => normalizeStudyEvent(row as Record<string, unknown>)),
    updatedAt: new Date().toISOString(),
  };
}

export async function upsertSupabaseNode(node: DeckNode) {
  const client = getSupabaseBrowserClient();

  if (!client) {
    return;
  }

  const { error } = await client.from("decks").upsert({
    id: node.id,
    user_id: node.userId,
    parent_id: node.parentId,
    kind: node.kind,
    title: node.title,
    description: node.description,
    color: node.color,
    position: node.position,
    created_at: node.createdAt,
    updated_at: node.updatedAt,
  });

  if (error) {
    throw error;
  }
}

export async function deleteSupabaseNode(nodeId: string) {
  const client = getSupabaseBrowserClient();

  if (!client) {
    return;
  }

  const { error } = await client.from("decks").delete().eq("id", nodeId);

  if (error) {
    throw error;
  }
}

export async function upsertSupabaseCard(card: CardRecord) {
  const client = getSupabaseBrowserClient();

  if (!client) {
    return;
  }

  const { error } = await client.from("cards").upsert({
    id: card.id,
    user_id: card.userId,
    deck_id: card.deckId,
    front_html: card.frontHtml,
    back_html: card.backHtml,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
  });

  if (error) {
    throw error;
  }
}

export async function deleteSupabaseCard(cardId: string) {
  const client = getSupabaseBrowserClient();

  if (!client) {
    return;
  }

  const { error } = await client.from("cards").delete().eq("id", cardId);

  if (error) {
    throw error;
  }
}

export async function upsertSupabaseReview(review: ReviewRecord) {
  const client = getSupabaseBrowserClient();

  if (!client) {
    return;
  }

  const { error } = await client.from("review_states").upsert({
    card_id: review.cardId,
    user_id: review.userId,
    state: review.state,
    due_at: review.dueAt,
    interval_days: review.intervalDays,
    ease_factor: review.easeFactor,
    repetitions: review.repetitions,
    lapses: review.lapses,
    last_reviewed_at: review.lastReviewedAt,
    updated_at: review.updatedAt,
  });

  if (error) {
    throw error;
  }
}

export async function insertSupabaseStudyEvent(event: StudyEvent) {
  const client = getSupabaseBrowserClient();

  if (!client) {
    return;
  }

  const { error } = await client.from("study_events").insert({
    id: event.id,
    user_id: event.userId,
    card_id: event.cardId,
    deck_id: event.deckId,
    rating: event.rating,
    previous_state: event.previousState,
    studied_at: event.studiedAt,
    next_due_at: event.nextDueAt,
  });

  if (error) {
    throw error;
  }
}
