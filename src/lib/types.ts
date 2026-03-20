export type AuthMode = "demo" | "supabase";
export type NodeKind = "deck" | "folder";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type ReviewStateKind = "new" | "learning" | "review";
export type AppView = "dashboard" | "node" | "review";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface DeckNode {
  id: string;
  userId: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  description: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardRecord {
  id: string;
  userId: string;
  deckId: string;
  frontHtml: string;
  backHtml: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRecord {
  cardId: string;
  userId: string;
  state: ReviewStateKind;
  dueAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface StudyEvent {
  id: string;
  userId: string;
  cardId: string;
  deckId: string;
  rating: ReviewRating;
  previousState: ReviewStateKind;
  studiedAt: string;
  nextDueAt: string;
}

export interface WorkspaceData {
  decks: DeckNode[];
  cards: CardRecord[];
  reviews: Record<string, ReviewRecord>;
  studyEvents: StudyEvent[];
  updatedAt: string;
}

export interface AppSession {
  mode: AuthMode;
  user: AppUser;
}

export interface DashboardStats {
  dueNow: number;
  newCards: number;
  reviewedToday: number;
  totalCards: number;
  deckCount: number;
}

export interface ReviewQueueItem {
  card: CardRecord;
  review: ReviewRecord;
}

export interface NodeDraft {
  id?: string;
  title: string;
  description: string;
  kind: NodeKind;
  color: string;
  parentId: string | null;
}

export interface CardDraft {
  id?: string;
  deckId: string;
  frontHtml: string;
  backHtml: string;
}
