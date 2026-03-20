"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import clsx from "clsx";
import {
  format,
  formatDistanceToNow,
  isToday,
  startOfToday,
} from "date-fns";
import {
  ArrowLeft,
  BookHeart,
  BookMarked,
  ChevronRight,
  FolderPlus,
  GalleryVerticalEnd,
  Grip,
  Keyboard,
  Layers3,
  LogOut,
  Plus,
  RotateCcw,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { RichTextEditor } from "@/components/rich-text-editor";
import { sanitizeRichHtml, excerptHtml } from "@/lib/content";
import { DEMO_SESSION, createDemoWorkspace } from "@/lib/demo-data";
import { createDefaultReview, scheduleReview } from "@/lib/scheduling";
import {
  deleteSupabaseCard,
  deleteSupabaseNode,
  getSupabaseBrowserClient,
  insertSupabaseStudyEvent,
  isSupabaseConfigured,
  loadSupabaseWorkspace,
  toAppSession,
  upsertSupabaseCard,
  upsertSupabaseNode,
  upsertSupabaseReview,
} from "@/lib/supabase";
import {
  countDueCards,
  getCardsForNode,
  getDescendantDeckIds,
  getDescendantNodeIds,
  getNodeChildren,
  getNodePath,
  sortNodes,
} from "@/lib/tree";
import type {
  AppSession,
  AppView,
  CardDraft,
  CardRecord,
  DashboardStats,
  DeckNode,
  NodeDraft,
  ReviewQueueItem,
  ReviewRating,
  StudyEvent,
  WorkspaceData,
} from "@/lib/types";

const SESSION_STORAGE_KEY = "lilt.session";
const WORKSPACE_STORAGE_KEY = "lilt.demo.workspace";
const EMPTY_DECKS: DeckNode[] = [];
const EMPTY_CARDS: CardRecord[] = [];
const EMPTY_REVIEWS: WorkspaceData["reviews"] = {};
const EMPTY_STUDY_EVENTS: StudyEvent[] = [];

const RATING_META: Record<
  ReviewRating,
  { label: string; key: string; tone: string; description: string }
> = {
  again: {
    label: "Again",
    key: "1",
    tone: "bg-rose-100 text-rose-700 border-rose-200",
    description: "Relearn this tomorrow and keep it close.",
  },
  hard: {
    label: "Hard",
    key: "2",
    tone: "bg-amber-100 text-amber-700 border-amber-200",
    description: "Small nudge forward without overcommitting.",
  },
  good: {
    label: "Good",
    key: "3",
    tone: "bg-emerald-100 text-emerald-700 border-emerald-200",
    description: "Default pacing for confident recall.",
  },
  easy: {
    label: "Easy",
    key: "4",
    tone: "bg-sky-100 text-sky-700 border-sky-200",
    description: "Push far out when recall feels effortless.",
  },
};

const NODE_COLORS = ["#f29cb6", "#f8c46f", "#a3d7c1", "#97b8ff", "#e7b3f6"];

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function emptyCardDraft(deckId: string): CardDraft {
  return {
    deckId,
    frontHtml: "<p></p>",
    backHtml: "<p></p>",
  };
}

function emptyNodeDraft(kind: "deck" | "folder", parentId: string | null): NodeDraft {
  return {
    title: "",
    description: "",
    kind,
    color: NODE_COLORS[0],
    parentId,
  };
}

function loadDemoWorkspace() {
  if (typeof window === "undefined") {
    return createDemoWorkspace();
  }

  const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) {
    const seed = createDemoWorkspace();
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    return JSON.parse(raw) as WorkspaceData;
  } catch {
    const seed = createDemoWorkspace();
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function persistDemoWorkspace(workspace: WorkspaceData) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  }
}

function persistSession(session: AppSession | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function loadStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

export function AnkiMvpApp() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AppSession | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [view, setView] = useState<AppView>("dashboard");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState<CardDraft | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewRevealed, setReviewRevealed] = useState(false);
  const [reviewContextNodeId, setReviewContextNodeId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const handleReviewKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setReviewRevealed((current) => !current);
      return;
    }

    if (!reviewRevealed) {
      return;
    }

    if (event.key === "1") {
      event.preventDefault();
      void submitReview("again");
    } else if (event.key === "2") {
      event.preventDefault();
      void submitReview("hard");
    } else if (event.key === "3") {
      event.preventDefault();
      void submitReview("good");
    } else if (event.key === "4") {
      event.preventDefault();
      void submitReview("easy");
    } else if (event.key === "Escape") {
      event.preventDefault();
      endReviewSession();
    }
  });

  useEffect(() => {
    let ignore = false;
    const supabase = getSupabaseBrowserClient();

    async function initialize() {
      try {
        let loadedSupabaseSession = false;
        if (supabase) {
          const {
            data: { session: authSession },
          } = await supabase.auth.getSession();

          if (!ignore && authSession) {
            const nextSession = toAppSession(authSession);
            setSession(nextSession);
            setWorkspace(await loadSupabaseWorkspace(nextSession.user));
            loadedSupabaseSession = true;
          }
        }

        if (!ignore && !loadedSupabaseSession) {
          const storedSession = loadStoredSession();
          if (storedSession?.mode === "demo") {
            setSession(DEMO_SESSION);
            setWorkspace(loadDemoWorkspace());
          }
        }
      } catch (error) {
        if (!ignore) {
          toast.error(error instanceof Error ? error.message : "Failed to initialize the app.");
        }
      } finally {
        if (!ignore) {
          setReady(true);
        }
      }
    }

    initialize();

    if (!supabase) {
      return () => {
        ignore = true;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, authSession) => {
      if (!authSession) {
        const storedSession = loadStoredSession();
        if (storedSession?.mode === "demo") {
          setSession(DEMO_SESSION);
          setWorkspace(loadDemoWorkspace());
          setReady(true);
          return;
        }

        setSession(null);
        setWorkspace(null);
        setSelectedNodeId(null);
        setSelectedCardId(null);
        setCardDraft(null);
        persistSession(null);
        setReady(true);
        return;
      }

      const nextSession = toAppSession(authSession);
      setSession(nextSession);
      persistSession(nextSession);
      setWorkspace(await loadSupabaseWorkspace(nextSession.user));
      setReady(true);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    persistSession(session);
  }, [session]);

  useEffect(() => {
    if (session?.mode === "demo" && workspace) {
      persistDemoWorkspace(workspace);
    }
  }, [session, workspace]);

  useEffect(() => {
    if (view !== "review") {
      return;
    }

    window.addEventListener("keydown", handleReviewKey);
    return () => window.removeEventListener("keydown", handleReviewKey);
  }, [view]);

  const nodes = workspace?.decks ?? EMPTY_DECKS;
  const cards = workspace?.cards ?? EMPTY_CARDS;
  const reviews = workspace?.reviews ?? EMPTY_REVIEWS;
  const studyEvents = workspace?.studyEvents ?? EMPTY_STUDY_EVENTS;
  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const selectedNodeCards = workspace && selectedNodeId ? getCardsForNode(workspace, selectedNodeId) : [];
  const selectedDeckCards = selectedNode?.kind === "deck" ? cards.filter((card) => card.deckId === selectedNode.id) : [];
  const reviewItem = reviewQueue[0] ?? null;
  const reviewProgress = reviewQueue.length;
  const isDemoMode = session?.mode === "demo";
  const breadcrumb = getNodePath(nodes, selectedNodeId);

  const dashboardStats = useMemo<DashboardStats>(() => {
    const totalCards = cards.length;
    const deckCount = nodes.filter((node) => node.kind === "deck").length;
    const newCards = Object.values(reviews).filter((review) => review.state === "new").length;
    const dueNow = countDueCards(cards, reviews);
    const reviewedToday = studyEvents.filter((event) => isToday(new Date(event.studiedAt))).length;

    return {
      dueNow,
      newCards,
      reviewedToday,
      totalCards,
      deckCount,
    };
  }, [cards, nodes, reviews, studyEvents]);

  const dueDeckRows = useMemo(() => {
    return nodes
      .filter((node) => node.kind === "deck")
      .map((deck) => {
        const deckCards = cards.filter((card) => card.deckId === deck.id);
        return {
          node: deck,
          total: deckCards.length,
          due: countDueCards(deckCards, reviews),
        };
      })
      .filter((entry) => entry.total > 0)
      .sort((left, right) => right.due - left.due || right.total - left.total)
      .slice(0, 6);
  }, [cards, nodes, reviews]);

  const currentCard = selectedCardId
    ? cards.find((card) => card.id === selectedCardId) ?? null
    : null;

  const reviewCountForSelectedNode =
    workspace && selectedNodeId ? countDueCards(selectedNodeCards, reviews) : dashboardStats.dueNow;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="soft-panel rounded-[2rem] px-8 py-6 text-sm text-muted">
          Warming up your study space...
        </div>
      </div>
    );
  }

  if (!session || !workspace) {
    return (
      <>
        <LandingScreen
          googleReady={isSupabaseConfigured()}
          onDemo={() => {
            setSession(DEMO_SESSION);
            setWorkspace(loadDemoWorkspace());
            toast.success("Demo workspace ready.");
          }}
          onGoogle={() => void signInWithGoogle()}
        />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <>
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="soft-panel mb-4 rounded-[2rem] px-5 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-rose/25">
                <BookHeart className="size-6 text-rose-deep" />
              </div>
              <div>
                <p className="section-title text-3xl font-semibold">Lilt</p>
                <p className="text-sm text-muted">
                  A softer, cleaner private flashcard routine for laptop and phone.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-line bg-white/80 px-4 py-2 text-sm text-muted">
                {format(new Date(), "EEEE, MMMM d")}
              </span>
              <StatusPill state={syncState} isDemo={isDemoMode} />
              <Button variant="soft" onClick={() => setShowShortcuts(true)} icon={<Keyboard className="size-4" />}>
                Shortcuts
              </Button>
              <Button
                onClick={() => startReviewSession(selectedNodeId)}
                icon={<Sparkles className="size-4" />}
              >
                Review {reviewCountForSelectedNode > 0 ? `${reviewCountForSelectedNode} due` : "today"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => void signOut()}
                icon={<LogOut className="size-4" />}
              >
                {isDemoMode ? "Leave demo" : "Sign out"}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="soft-panel rounded-[2rem] p-4">
            <div className="mb-5 flex items-center gap-3 rounded-[1.5rem] border border-line bg-white/80 p-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-background-soft text-lg font-bold text-rose-deep">
                {session.user.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{session.user.name}</p>
                <p className="truncate text-sm text-muted">{session.user.email}</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <Button variant="soft" onClick={() => setView("dashboard")} icon={<GalleryVerticalEnd className="size-4" />}>
                Dashboard
              </Button>
              <Button
                variant="soft"
                onClick={() => setNodeDraft(emptyNodeDraft("folder", null))}
                icon={<FolderPlus className="size-4" />}
              >
                Folder
              </Button>
              <Button
                variant="soft"
                onClick={() => setNodeDraft(emptyNodeDraft("deck", null))}
                icon={<Plus className="size-4" />}
              >
                Deck
              </Button>
              <Button
                variant="soft"
                onClick={() => startReviewSession(null)}
                icon={<RotateCcw className="size-4" />}
              >
                Due queue
              </Button>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Deck tree</p>
              <span className="rounded-full bg-background-soft px-3 py-1 text-xs text-muted">
                {nodes.filter((node) => node.kind === "deck").length} decks
              </span>
            </div>

            <div className="space-y-1">
              {getNodeChildren(nodes, null).map((node) => (
                <SidebarNodeItem
                  key={node.id}
                  node={node}
                  nodes={nodes}
                  cards={cards}
                  reviews={reviews}
                  selectedNodeId={selectedNodeId}
                  onSelect={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    setSelectedCardId(null);
                    setCardDraft(null);
                    setView("node");
                  }}
                />
              ))}
              {nodes.length === 0 && (
                <EmptySplash
                  title="No decks yet"
                  description="Start with a folder for a subject, then add a deck for the actual cards."
                  actionLabel="Create your first deck"
                  onAction={() => setNodeDraft(emptyNodeDraft("deck", null))}
                />
              )}
            </div>
          </aside>

          <main className="flex min-h-[70vh] flex-col">
            {view === "dashboard" && (
              <DashboardView
                stats={dashboardStats}
                dueDeckRows={dueDeckRows}
                studyEvents={studyEvents}
                onOpenDeck={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedCardId(null);
                  setCardDraft(null);
                  setView("node");
                }}
                onStartReview={() => startReviewSession(null)}
                onCreateDeck={() => setNodeDraft(emptyNodeDraft("deck", null))}
              />
            )}

            {view === "node" && selectedNode && (
              <section className="soft-panel flex h-full flex-col rounded-[2rem] p-4 sm:p-6">
                <div className="mb-5 flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <button type="button" onClick={() => setView("dashboard")} className="inline-flex items-center gap-1 hover:text-foreground">
                        <ArrowLeft className="size-4" />
                        Dashboard
                      </button>
                      {breadcrumb.map((node, index) => (
                        <span key={node.id} className="inline-flex items-center gap-2">
                          <ChevronRight className="size-4" />
                          <button
                            type="button"
                            className={clsx("hover:text-foreground", index === breadcrumb.length - 1 && "text-foreground")}
                            onClick={() => {
                              setSelectedNodeId(node.id);
                              setSelectedCardId(null);
                              setCardDraft(null);
                              setView("node");
                            }}
                          >
                            {node.title}
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="size-4 rounded-full"
                        style={{ backgroundColor: selectedNode.color }}
                      />
                      <h1 className="section-title text-4xl font-semibold">
                        {selectedNode.title}
                      </h1>
                      <span className="rounded-full bg-background-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        {selectedNode.kind}
                      </span>
                    </div>
                    <p className="max-w-3xl text-sm leading-7 text-muted">
                      {selectedNode.description || "Add a short description so future you knows what belongs here."}
                    </p>
                    <div className="flex flex-wrap gap-3 text-sm text-muted">
                      <span>{selectedNodeCards.length} cards in scope</span>
                      <span>{reviewCountForSelectedNode} due now</span>
                      <span>{selectedNode.kind === "deck" ? "Direct editing enabled" : "Folder overview mode"}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="soft" onClick={() => setNodeDraft({
                      id: selectedNode.id,
                      title: selectedNode.title,
                      description: selectedNode.description,
                      kind: selectedNode.kind,
                      color: selectedNode.color,
                      parentId: selectedNode.parentId,
                    })} icon={<SquarePen className="size-4" />}>
                      Edit
                    </Button>
                    <Button
                      variant="soft"
                      onClick={() => setNodeDraft(emptyNodeDraft("deck", selectedNode.id))}
                      icon={<Plus className="size-4" />}
                    >
                      Child deck
                    </Button>
                    {selectedNode.kind === "deck" && (
                      <Button
                        onClick={() => {
                          setSelectedCardId(null);
                          setCardDraft(emptyCardDraft(selectedNode.id));
                        }}
                        icon={<BookMarked className="size-4" />}
                      >
                        New card
                      </Button>
                    )}
                    <Button onClick={() => startReviewSession(selectedNode.id)} icon={<Sparkles className="size-4" />}>
                      Review
                    </Button>
                    <Button variant="ghost" onClick={() => void removeNode(selectedNode.id)} icon={<Trash2 className="size-4" />}>
                      Delete
                    </Button>
                  </div>
                </div>

                {selectedNode.kind === "folder" ? (
                  <FolderOverview
                    nodes={nodes}
                    cards={cards}
                    reviews={reviews}
                    rootNode={selectedNode}
                    onOpenNode={(nodeId) => {
                      setSelectedNodeId(nodeId);
                      setSelectedCardId(null);
                      setCardDraft(null);
                      setView("node");
                    }}
                    onCreateChild={() => setNodeDraft(emptyNodeDraft("deck", selectedNode.id))}
                  />
                ) : (
                  <div className="grid flex-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <CardListPanel
                      cards={selectedDeckCards}
                      reviews={reviews}
                      selectedCardId={selectedCardId}
                      onSelect={(cardId) => {
                        const nextCard = selectedDeckCards.find((card) => card.id === cardId);
                        setSelectedCardId(cardId);
                        setCardDraft(
                          nextCard
                            ? {
                                id: nextCard.id,
                                deckId: nextCard.deckId,
                                frontHtml: nextCard.frontHtml,
                                backHtml: nextCard.backHtml,
                              }
                            : null,
                        );
                      }}
                      onCreate={() => {
                        setSelectedCardId(null);
                        setCardDraft(emptyCardDraft(selectedNode.id));
                      }}
                    />
                    <CardEditorPanel
                      node={selectedNode}
                      draft={cardDraft}
                      activeCard={currentCard}
                      onDraftChange={setCardDraft}
                      onSave={() => void saveCardDraft()}
                      onDelete={() => void deleteCard()}
                      onStartReview={() => startReviewSession(selectedNode.id)}
                    />
                  </div>
                )}
              </section>
            )}

            {view === "review" && reviewItem && (
              <ReviewSessionView
                item={reviewItem}
                remaining={reviewProgress}
                onExit={endReviewSession}
                revealed={reviewRevealed}
                onReveal={() => setReviewRevealed((current) => !current)}
                onRate={(rating) => void submitReview(rating)}
              />
            )}
          </main>
        </div>
      </div>

      {nodeDraft && (
        <NodeModal
          nodes={nodes}
          draft={nodeDraft}
          onClose={() => setNodeDraft(null)}
          onChange={setNodeDraft}
          onSubmit={() => void saveNodeDraft()}
        />
      )}

      {showShortcuts && <ShortcutModal onClose={() => setShowShortcuts(false)} />}

      <Toaster richColors position="top-right" />
    </>
  );

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      toast.info("Supabase and Google OAuth are not configured yet. Use the demo workspace locally.");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      toast.error(error.message);
    }
  }

  async function signOut() {
    if (session?.mode === "demo") {
      setSession(null);
      setWorkspace(null);
      persistSession(null);
      setView("dashboard");
      toast.success("Demo session closed.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Signed out.");
    }
  }

  async function saveNodeDraft() {
    if (!workspace || !session || !nodeDraft) {
      return;
    }

    if (!nodeDraft.title.trim()) {
      toast.error("Name the deck or folder first.");
      return;
    }

    const now = new Date().toISOString();
    const existing = nodeDraft.id ? nodes.find((node) => node.id === nodeDraft.id) ?? null : null;
    const nextNode: DeckNode = existing
      ? {
          ...existing,
          title: nodeDraft.title.trim(),
          description: nodeDraft.description.trim(),
          kind: nodeDraft.kind,
          color: nodeDraft.color,
          parentId: nodeDraft.parentId,
          updatedAt: now,
        }
      : {
          id: createId(nodeDraft.kind),
          userId: session.user.id,
          title: nodeDraft.title.trim(),
          description: nodeDraft.description.trim(),
          kind: nodeDraft.kind,
          color: nodeDraft.color,
          parentId: nodeDraft.parentId,
          position: nodes.length,
          createdAt: now,
          updatedAt: now,
        };

    const nextWorkspace: WorkspaceData = {
      ...workspace,
      decks: sortNodes([
        ...nodes.filter((node) => node.id !== nextNode.id),
        nextNode,
      ]),
      updatedAt: now,
    };

    setWorkspace(nextWorkspace);
    setNodeDraft(null);
    setSelectedNodeId(nextNode.id);
    setView("node");
    await sync(async () => {
      if (session.mode === "supabase") {
        await upsertSupabaseNode(nextNode);
      }
    });
    toast.success(existing ? "Deck updated." : `${nextNode.kind === "deck" ? "Deck" : "Folder"} created.`);
  }

  async function removeNode(nodeId: string) {
    if (!workspace || !session) {
      return;
    }

    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return;
    }

    const confirmed = window.confirm(`Delete "${node.title}" and everything inside it?`);
    if (!confirmed) {
      return;
    }

    const descendantIds = getDescendantNodeIds(nodes, nodeId);
    const deckIds = new Set(
      nodes.filter((entry) => entry.kind === "deck" && descendantIds.has(entry.id)).map((entry) => entry.id),
    );
    const cardsToDelete = cards.filter((card) => deckIds.has(card.deckId)).map((card) => card.id);
    const now = new Date().toISOString();
    const nextWorkspace: WorkspaceData = {
      ...workspace,
      decks: nodes.filter((entry) => !descendantIds.has(entry.id)),
      cards: cards.filter((card) => !cardsToDelete.includes(card.id)),
      reviews: Object.fromEntries(
        Object.entries(reviews).filter(([cardId]) => !cardsToDelete.includes(cardId)),
      ),
      studyEvents: studyEvents.filter((event) => !cardsToDelete.includes(event.cardId)),
      updatedAt: now,
    };

    setWorkspace(nextWorkspace);
    setSelectedNodeId(null);
    setSelectedCardId(null);
    setCardDraft(null);
    setView("dashboard");

    await sync(async () => {
      if (session.mode === "supabase") {
        await deleteSupabaseNode(nodeId);
      }
    });

    toast.success("Deck tree cleaned up.");
  }

  async function saveCardDraft() {
    if (!workspace || !session || !cardDraft) {
      return;
    }

    if (!cardDraft.deckId) {
      toast.error("Pick a destination deck first.");
      return;
    }

    const frontHtml = sanitizeRichHtml(cardDraft.frontHtml);
    const backHtml = sanitizeRichHtml(cardDraft.backHtml);
    if (excerptHtml(frontHtml).length === 0 || excerptHtml(backHtml).length === 0) {
      toast.error("Both front and back need some content.");
      return;
    }

    const now = new Date().toISOString();
    const existing = cardDraft.id ? cards.find((card) => card.id === cardDraft.id) ?? null : null;
    const nextCard: CardRecord = existing
      ? {
          ...existing,
          deckId: cardDraft.deckId,
          frontHtml,
          backHtml,
          updatedAt: now,
        }
      : {
          id: createId("card"),
          userId: session.user.id,
          deckId: cardDraft.deckId,
          frontHtml,
          backHtml,
          createdAt: now,
          updatedAt: now,
        };

    const nextReview = reviews[nextCard.id] ?? createDefaultReview(nextCard.id, session.user.id);
    const nextWorkspace: WorkspaceData = {
      ...workspace,
      cards: [nextCard, ...cards.filter((card) => card.id !== nextCard.id)],
      reviews: {
        ...reviews,
        [nextCard.id]: nextReview,
      },
      updatedAt: now,
    };

    setWorkspace(nextWorkspace);
    setSelectedCardId(nextCard.id);
    setCardDraft({
      id: nextCard.id,
      deckId: nextCard.deckId,
      frontHtml: nextCard.frontHtml,
      backHtml: nextCard.backHtml,
    });

    await sync(async () => {
      if (session.mode === "supabase") {
        await upsertSupabaseCard(nextCard);
        await upsertSupabaseReview(nextReview);
      }
    });

    toast.success(existing ? "Card updated." : "Card saved.");
  }

  async function deleteCard() {
    if (!workspace || !selectedCardId) {
      return;
    }

    const confirmed = window.confirm("Delete this card?");
    if (!confirmed) {
      return;
    }

    const nextCards = cards.filter((card) => card.id !== selectedCardId);
    const nextReviews = Object.fromEntries(
      Object.entries(reviews).filter(([cardId]) => cardId !== selectedCardId),
    );
    const nextEvents = studyEvents.filter((event) => event.cardId !== selectedCardId);

    setWorkspace({
      ...workspace,
      cards: nextCards,
      reviews: nextReviews,
      studyEvents: nextEvents,
      updatedAt: new Date().toISOString(),
    });
    setSelectedCardId(null);
    setCardDraft(selectedNode?.kind === "deck" ? emptyCardDraft(selectedNode.id) : null);

    await sync(async () => {
      if (session?.mode === "supabase") {
        await deleteSupabaseCard(selectedCardId);
      }
    });

    toast.success("Card removed.");
  }

  function startReviewSession(nodeId: string | null) {
    if (!workspace || !session) {
      return;
    }

    const scopedCards = nodeId ? getCardsForNode(workspace, nodeId) : cards;
    const now = new Date().getTime();
    const queue = scopedCards
      .map((card) => ({
        card,
        review: reviews[card.id] ?? createDefaultReview(card.id, session.user.id),
      }))
      .filter((entry) => new Date(entry.review.dueAt).getTime() <= now)
      .sort((left, right) => new Date(left.review.dueAt).getTime() - new Date(right.review.dueAt).getTime());

    if (queue.length === 0) {
      toast.success("Nothing due right now.");
      return;
    }

    setReviewContextNodeId(nodeId);
    setReviewQueue(queue);
    setReviewRevealed(false);
    setView("review");
  }

  function endReviewSession() {
    setReviewQueue([]);
    setReviewRevealed(false);
    setView(selectedNodeId ? "node" : "dashboard");
  }

  async function submitReview(rating: ReviewRating) {
    if (!reviewItem || !workspace || !session) {
      return;
    }

    const previousReview = reviews[reviewItem.card.id] ?? createDefaultReview(reviewItem.card.id, session.user.id);
    const nextReview = scheduleReview(previousReview, rating);
    const event: StudyEvent = {
      id: createId("study"),
      userId: session.user.id,
      cardId: reviewItem.card.id,
      deckId: reviewItem.card.deckId,
      rating,
      previousState: previousReview.state,
      studiedAt: new Date().toISOString(),
      nextDueAt: nextReview.dueAt,
    };

    const willRequeue = rating === "again";
    const nextQueueLength = reviewQueue.length - 1 + (willRequeue ? 1 : 0);
    const nextWorkspace: WorkspaceData = {
      ...workspace,
      reviews: {
        ...reviews,
        [reviewItem.card.id]: nextReview,
      },
      studyEvents: [event, ...studyEvents].slice(0, 300),
      updatedAt: new Date().toISOString(),
    };

    setWorkspace(nextWorkspace);
    setReviewQueue((currentQueue) => {
      const remaining = currentQueue.slice(1);
      if (willRequeue) {
        remaining.push({
          card: reviewItem.card,
          review: {
            ...nextReview,
            dueAt: new Date().toISOString(),
          },
        });
      }
      return remaining;
    });
    setReviewRevealed(false);

    await sync(async () => {
      if (session.mode === "supabase") {
        await upsertSupabaseReview(nextReview);
        await insertSupabaseStudyEvent(event);
      }
    });

    if (nextQueueLength <= 0) {
      toast.success("Review block finished.");
      if (reviewContextNodeId) {
        setView("node");
      } else {
        setView("dashboard");
      }
    }
  }

  async function sync(task: () => Promise<void>) {
    try {
      setSyncState("saving");
      await task();
      setSyncState("saved");
      window.setTimeout(() => setSyncState("idle"), 1400);
    } catch (error) {
      setSyncState("error");
      toast.error(error instanceof Error ? error.message : "Sync failed.");
    }
  }
}

function LandingScreen({
  googleReady,
  onGoogle,
  onDemo,
}: {
  googleReady: boolean;
  onGoogle: () => void;
  onDemo: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] items-center px-6 py-12">
      <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="soft-panel relative overflow-hidden rounded-[2.5rem] px-7 py-8 sm:px-10 sm:py-10">
          <div className="absolute -right-8 top-8 size-32 rounded-full bg-butter/35 blur-2xl" />
          <div className="absolute bottom-8 left-8 size-28 rounded-full bg-rose/25 blur-2xl" />
          <div className="relative max-w-2xl">
            <span className="mb-4 inline-flex rounded-full border border-line bg-white/80 px-4 py-2 text-sm text-muted">
              Private decks. Google sign-in first. Demo-ready locally.
            </span>
            <h1 className="section-title max-w-3xl text-5xl font-semibold leading-none sm:text-7xl">
              Lilt makes spaced repetition feel warm, premium, and actually pleasant.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted sm:text-lg">
              Build private nested decks, write rich flashcards with images and tables, and study with an
              Anki-inspired flow that stays lightweight on phone and laptop.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={onGoogle} disabled={!googleReady} icon={<Sparkles className="size-4" />}>
                Continue with Google
              </Button>
              <Button variant="soft" onClick={onDemo} icon={<BookMarked className="size-4" />}>
                Explore demo workspace
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted">
              {googleReady
                ? "Google OAuth is wired through Supabase. Sign in and your own workspace will load."
                : "For local development, Google login stays disabled until Supabase env vars and OAuth secrets are added."}
            </p>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <FeatureCard
            icon={<Layers3 className="size-5" />}
            title="Nested deck tree"
            description="Mix folders and decks so different subjects still feel tidy when the card count grows."
          />
          <FeatureCard
            icon={<SquarePen className="size-5" />}
            title="Rich editing"
            description="Cards support images, code blocks, and tables directly in both front and back fields."
          />
          <FeatureCard
            icon={<RotateCcw className="size-5" />}
            title="Fast review loop"
            description="Flip with space, answer with 1-4, and keep the entire review flow keyboard-friendly."
          />
          <FeatureCard
            icon={<Grip className="size-5" />}
            title="Coherent MVP"
            description="Works locally without secrets, then upgrades cleanly to private Supabase-backed accounts."
          />
        </section>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="soft-panel rounded-[2rem] p-6">
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-background-soft text-rose-deep">
        {icon}
      </div>
      <h2 className="section-title text-3xl font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-muted">{description}</p>
    </div>
  );
}

function StatusPill({ state, isDemo }: { state: "idle" | "saving" | "saved" | "error"; isDemo: boolean }) {
  const label =
    state === "saving"
      ? "Saving..."
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Sync error"
          : isDemo
            ? "Demo mode"
            : "Synced";

  return (
    <span className="rounded-full border border-line bg-white/80 px-4 py-2 text-sm text-muted">
      {label}
    </span>
  );
}

function Button({
  children,
  onClick,
  icon,
  variant = "primary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: "primary" | "soft" | "ghost";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-foreground text-white shadow-[0_12px_30px_rgba(58,42,45,0.18)] hover:-translate-y-0.5",
        variant === "soft" && "border border-line bg-white/85 text-foreground hover:border-line-strong hover:bg-white",
        variant === "ghost" && "text-muted hover:bg-white/70 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function EmptySplash({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="gradient-border rounded-[1.5rem] p-4 text-center">
      <p className="section-title text-2xl font-semibold">{title}</p>
      <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
      <div className="mt-4">
        <Button variant="soft" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function SidebarNodeItem({
  node,
  nodes,
  cards,
  reviews,
  selectedNodeId,
  onSelect,
}: {
  node: DeckNode;
  nodes: DeckNode[];
  cards: CardRecord[];
  reviews: WorkspaceData["reviews"];
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  const children = getNodeChildren(nodes, node.id);
  const scopedCards = cards.filter((card) =>
    getDescendantDeckIds(nodes, node.id).includes(card.deckId),
  );
  const due = countDueCards(scopedCards, reviews);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={clsx(
          "flex w-full items-center gap-3 rounded-[1.2rem] px-3 py-2.5 text-left transition",
          selectedNodeId === node.id ? "bg-white shadow-sm" : "hover:bg-white/70",
        )}
      >
        <span className="size-3 rounded-full" style={{ backgroundColor: node.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{node.title}</p>
          <p className="truncate text-xs text-muted">
            {node.kind === "folder" ? `${children.length} children` : `${scopedCards.length} cards`}
          </p>
        </div>
        {due > 0 && <span className="rounded-full bg-background-soft px-2.5 py-1 text-xs text-muted">{due}</span>}
      </button>
      {children.length > 0 && (
        <div className="ml-4 space-y-1 border-l border-line pl-2">
          {children.map((child) => (
            <SidebarNodeItem
              key={child.id}
              node={child}
              nodes={nodes}
              cards={cards}
              reviews={reviews}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardView({
  stats,
  dueDeckRows,
  studyEvents,
  onOpenDeck,
  onStartReview,
  onCreateDeck,
}: {
  stats: DashboardStats;
  dueDeckRows: Array<{ node: DeckNode; total: number; due: number }>;
  studyEvents: StudyEvent[];
  onOpenDeck: (nodeId: string) => void;
  onStartReview: () => void;
  onCreateDeck: () => void;
}) {
  const todayStart = startOfToday();
  const recentToday = studyEvents.filter((event) => new Date(event.studiedAt) >= todayStart).slice(0, 6);

  return (
    <section className="grid h-full gap-4">
      <div className="soft-panel rounded-[2rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-bold tracking-[0.2em] text-muted uppercase">Daily dashboard</p>
            <h1 className="section-title text-4xl font-semibold sm:text-5xl">
              Keep momentum gentle, visible, and easy to return to.
            </h1>
            <p className="mt-4 text-sm leading-7 text-muted sm:text-base">
              Review what is due, nudge a deck forward, or add the next card while context is still fresh.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onStartReview} icon={<Sparkles className="size-4" />}>
              Start due review
            </Button>
            <Button variant="soft" onClick={onCreateDeck} icon={<Plus className="size-4" />}>
              Create deck
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Due now" value={stats.dueNow} accent="rose" />
        <StatCard label="Studied today" value={stats.reviewedToday} accent="mint" />
        <StatCard label="New cards" value={stats.newCards} accent="butter" />
        <StatCard label="Total cards" value={stats.totalCards} accent="sky" />
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="soft-panel rounded-[2rem] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Deck health</p>
              <h2 className="section-title text-3xl font-semibold">Where the queue lives</h2>
            </div>
          </div>
          <div className="space-y-3">
            {dueDeckRows.map(({ node, due, total }) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onOpenDeck(node.id)}
                className="flex w-full items-center justify-between rounded-[1.4rem] border border-line bg-white/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div className="flex items-center gap-3">
                  <span className="size-4 rounded-full" style={{ backgroundColor: node.color }} />
                  <div>
                    <p className="font-semibold text-foreground">{node.title}</p>
                    <p className="text-sm text-muted">
                      {due} due of {total} cards
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted" />
              </button>
            ))}
            {dueDeckRows.length === 0 && (
              <EmptySplash
                title="Queue is clear"
                description="There are no due cards yet. Add more material or wait for the next interval."
                actionLabel="Create another deck"
                onAction={onCreateDeck}
              />
            )}
          </div>
        </div>

        <div className="soft-panel rounded-[2rem] p-5 sm:p-6">
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Today</p>
          <h2 className="section-title text-3xl font-semibold">Study trace</h2>
          <div className="mt-4 space-y-3">
            {recentToday.map((event) => (
              <div key={event.id} className="rounded-[1.4rem] border border-line bg-white/78 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold capitalize text-foreground">{event.rating}</span>
                  <span className="text-xs text-muted">
                    {formatDistanceToNow(new Date(event.studiedAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  Next due {format(new Date(event.nextDueAt), "MMM d, h:mm a")}
                </p>
              </div>
            ))}
            {recentToday.length === 0 && (
              <EmptySplash
                title="Nothing studied yet"
                description="Your first few review reps today will appear here."
                actionLabel="Start your queue"
                onAction={onStartReview}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "rose" | "mint" | "butter" | "sky";
}) {
  const accentClass =
    accent === "rose"
      ? "bg-rose/20"
      : accent === "mint"
        ? "bg-mint/35"
        : accent === "butter"
          ? "bg-butter/35"
          : "bg-sky/30";

  return (
    <div className="soft-panel rounded-[1.8rem] p-5">
      <div className={clsx("mb-4 size-11 rounded-2xl", accentClass)} />
      <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">{label}</p>
      <p className="section-title mt-2 text-5xl font-semibold">{value}</p>
    </div>
  );
}

function FolderOverview({
  nodes,
  cards,
  reviews,
  rootNode,
  onOpenNode,
  onCreateChild,
}: {
  nodes: DeckNode[];
  cards: CardRecord[];
  reviews: WorkspaceData["reviews"];
  rootNode: DeckNode;
  onOpenNode: (nodeId: string) => void;
  onCreateChild: () => void;
}) {
  const children = getNodeChildren(nodes, rootNode.id);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {children.map((child) => {
        const deckIds = getDescendantDeckIds(nodes, child.id);
        const scopedCards = cards.filter((card) => deckIds.includes(card.deckId));
        const due = countDueCards(scopedCards, reviews);

        return (
          <button
            key={child.id}
            type="button"
            onClick={() => onOpenNode(child.id)}
            className="gradient-border rounded-[1.8rem] p-5 text-left transition hover:-translate-y-1"
          >
            <span className="mb-4 block size-4 rounded-full" style={{ backgroundColor: child.color }} />
            <p className="section-title text-3xl font-semibold">{child.title}</p>
            <p className="mt-3 text-sm leading-7 text-muted">{child.description || "No description yet."}</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-muted">
              <span>{child.kind}</span>
              <span>{scopedCards.length} cards</span>
              <span>{due} due</span>
            </div>
          </button>
        );
      })}

      {children.length === 0 && (
        <EmptySplash
          title="Empty folder"
          description="Add a child deck or another subfolder to start shaping this subject."
          actionLabel="Create child deck"
          onAction={onCreateChild}
        />
      )}
    </div>
  );
}

function CardListPanel({
  cards,
  reviews,
  selectedCardId,
  onSelect,
  onCreate,
}: {
  cards: CardRecord[];
  reviews: WorkspaceData["reviews"];
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="soft-panel flex flex-col rounded-[1.8rem] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Cards</p>
          <h2 className="section-title text-3xl font-semibold">Deck library</h2>
        </div>
        <Button variant="soft" onClick={onCreate} icon={<Plus className="size-4" />}>
          Add
        </Button>
      </div>
      <div className="space-y-3 overflow-auto">
        {cards.map((card) => {
          const review = reviews[card.id];
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(card.id)}
              className={clsx(
                "rounded-[1.4rem] border p-4 text-left transition",
                selectedCardId === card.id
                  ? "border-line-strong bg-white"
                  : "border-line bg-white/80 hover:border-line-strong hover:bg-white",
              )}
            >
              <p className="font-semibold text-foreground">{excerptHtml(card.frontHtml, 80) || "Untitled card"}</p>
              <p className="mt-2 text-sm text-muted">{excerptHtml(card.backHtml, 96) || "Add the answer on the back."}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                <span className="rounded-full bg-background-soft px-2.5 py-1 capitalize">
                  {review?.state ?? "new"}
                </span>
                <span className="rounded-full bg-background-soft px-2.5 py-1">
                  Due {review ? formatDistanceToNow(new Date(review.dueAt), { addSuffix: true }) : "now"}
                </span>
              </div>
            </button>
          );
        })}
        {cards.length === 0 && (
          <EmptySplash
            title="No cards in this deck"
            description="Create the first flashcard and use the rich editor for images, tables, or code."
            actionLabel="Create a card"
            onAction={onCreate}
          />
        )}
      </div>
    </div>
  );
}

function CardEditorPanel({
  node,
  draft,
  activeCard,
  onDraftChange,
  onSave,
  onDelete,
  onStartReview,
}: {
  node: DeckNode;
  draft: CardDraft | null;
  activeCard: CardRecord | null;
  onDraftChange: (draft: CardDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onStartReview: () => void;
}) {
  if (!draft) {
    return (
      <div className="soft-panel flex min-h-[32rem] flex-col items-center justify-center rounded-[1.8rem] p-6">
        <div className="max-w-md text-center">
          <p className="section-title text-4xl font-semibold">Choose a card or start a fresh one.</p>
          <p className="mt-4 text-sm leading-7 text-muted">
            This editor supports the full MVP format: rich text, images, tables, and code blocks.
          </p>
          <div className="mt-5">
            <Button onClick={onStartReview} icon={<Sparkles className="size-4" />}>
              Review this deck
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="soft-panel rounded-[1.8rem] p-4 sm:p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
            {activeCard ? "Edit card" : "New card"}
          </p>
          <h2 className="section-title text-3xl font-semibold">{node.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeCard && (
            <Button variant="ghost" onClick={onDelete} icon={<Trash2 className="size-4" />}>
              Delete
            </Button>
          )}
          <Button variant="soft" onClick={onStartReview} icon={<RotateCcw className="size-4" />}>
            Review deck
          </Button>
          <Button onClick={onSave} icon={<BookMarked className="size-4" />}>
            Save card
          </Button>
        </div>
      </div>
      <div className="grid gap-5">
        <RichTextEditor
          label="Front"
          value={draft.frontHtml}
          placeholder="Prompt, question, or concept cue..."
          onChange={(frontHtml) => onDraftChange({ ...draft, frontHtml })}
        />
        <RichTextEditor
          label="Back"
          value={draft.backHtml}
          placeholder="Answer, explanation, table, or code example..."
          onChange={(backHtml) => onDraftChange({ ...draft, backHtml })}
        />
      </div>
    </div>
  );
}

function ReviewSessionView({
  item,
  remaining,
  revealed,
  onReveal,
  onRate,
  onExit,
}: {
  item: ReviewQueueItem;
  remaining: number;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: ReviewRating) => void;
  onExit: () => void;
}) {
  return (
    <section className="soft-panel flex h-full flex-col rounded-[2rem] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Review mode</p>
          <h1 className="section-title text-4xl font-semibold">Stay with one prompt at a time.</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-line bg-white/80 px-4 py-2 text-sm text-muted">
            {remaining} left
          </span>
          <Button variant="ghost" onClick={onExit} icon={<ArrowLeft className="size-4" />}>
            Exit
          </Button>
        </div>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[1fr_0.42fr]">
        <div className="gradient-border flex min-h-[30rem] flex-col rounded-[2rem] p-6 sm:p-8">
          <div className="mb-4 text-sm text-muted">
            Press <kbd className="rounded bg-background-soft px-2 py-1">Space</kbd> to flip, then{" "}
            <kbd className="rounded bg-background-soft px-2 py-1">1-4</kbd> to rate.
          </div>
          <div className="grid flex-1 gap-5 lg:grid-cols-2">
            <div className="rounded-[1.5rem] border border-line bg-white/82 p-5">
              <p className="mb-3 text-xs font-bold tracking-[0.18em] text-muted uppercase">Front</p>
              <RichContent html={item.card.frontHtml} />
            </div>
            <div
              className={clsx(
                "rounded-[1.5rem] border p-5 transition",
                revealed
                  ? "border-line bg-white/90 opacity-100"
                  : "border-transparent bg-background-soft/80 opacity-50",
              )}
            >
              <p className="mb-3 text-xs font-bold tracking-[0.18em] text-muted uppercase">Back</p>
              {revealed ? (
                <RichContent html={item.card.backHtml} />
              ) : (
                <div className="flex h-full min-h-[18rem] items-center justify-center text-center text-sm text-muted">
                  Flip when you are ready to compare your answer.
                </div>
              )}
            </div>
          </div>
          <div className="mt-6">
            <Button variant={revealed ? "soft" : "primary"} onClick={onReveal} icon={<RotateCcw className="size-4" />}>
              {revealed ? "Hide answer" : "Show answer"}
            </Button>
          </div>
        </div>

        <div className="soft-panel rounded-[2rem] p-5">
          <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Decision</p>
          <h2 className="section-title text-3xl font-semibold">How did recall feel?</h2>
          <div className="mt-4 space-y-3">
            {(Object.entries(RATING_META) as Array<[ReviewRating, (typeof RATING_META)[ReviewRating]]>).map(
              ([rating, meta]) => (
                <button
                  key={rating}
                  type="button"
                  disabled={!revealed}
                  onClick={() => onRate(rating)}
                  className={clsx(
                    "w-full rounded-[1.5rem] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45",
                    meta.tone,
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{meta.label}</span>
                    <kbd className="rounded bg-white/70 px-2 py-1 text-xs">{meta.key}</kbd>
                  </div>
                  <p className="mt-2 text-sm opacity-80">{meta.description}</p>
                </button>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function NodeModal({
  nodes,
  draft,
  onClose,
  onChange,
  onSubmit,
}: {
  nodes: DeckNode[];
  draft: NodeDraft;
  onClose: () => void;
  onChange: (draft: NodeDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#72565c]/20 px-4 backdrop-blur-sm">
      <div className="soft-panel w-full max-w-2xl rounded-[2rem] p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">
              {draft.id ? "Edit node" : "Create node"}
            </p>
            <h2 className="section-title text-4xl font-semibold">
              {draft.id ? "Update deck structure" : "Shape the study tree"}
            </h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Title</span>
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              className="w-full rounded-[1.2rem] border border-line bg-white/88 px-4 py-3 outline-none transition focus:border-line-strong"
              placeholder="German essentials"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Type</span>
            <select
              value={draft.kind}
              onChange={(event) =>
                onChange({ ...draft, kind: event.target.value === "folder" ? "folder" : "deck" })
              }
              className="w-full rounded-[1.2rem] border border-line bg-white/88 px-4 py-3 outline-none transition focus:border-line-strong"
            >
              <option value="deck">Deck</option>
              <option value="folder">Folder</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Parent</span>
            <select
              value={draft.parentId ?? ""}
              onChange={(event) => onChange({ ...draft, parentId: event.target.value || null })}
              className="w-full rounded-[1.2rem] border border-line bg-white/88 px-4 py-3 outline-none transition focus:border-line-strong"
            >
              <option value="">Top level</option>
              {nodes.map((node) => (
                draft.id && getDescendantNodeIds(nodes, draft.id).has(node.id) ? null : (
                  <option key={node.id} value={node.id}>
                    {node.title}
                  </option>
                )
              ))}
            </select>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Description</span>
            <textarea
              value={draft.description}
              onChange={(event) => onChange({ ...draft, description: event.target.value })}
              rows={4}
              className="w-full rounded-[1.2rem] border border-line bg-white/88 px-4 py-3 outline-none transition focus:border-line-strong"
              placeholder="What kind of material belongs in this deck?"
            />
          </label>
          <div className="space-y-2 sm:col-span-2">
            <span className="text-sm font-semibold text-foreground">Accent</span>
            <div className="flex flex-wrap gap-3">
              {NODE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange({ ...draft, color })}
                  className={clsx(
                    "size-10 rounded-full border-2 transition",
                    draft.color === color ? "border-foreground scale-110" : "border-white/80",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>{draft.id ? "Save changes" : "Create node"}</Button>
        </div>
      </div>
    </div>
  );
}

function ShortcutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#72565c]/20 px-4 backdrop-blur-sm">
      <div className="soft-panel w-full max-w-xl rounded-[2rem] p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-muted uppercase">Keyboard shortcuts</p>
            <h2 className="section-title text-4xl font-semibold">Fast review keys</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-3">
          <ShortcutRow keys="Space / Enter" meaning="Flip the current review card" />
          <ShortcutRow keys="1" meaning="Again" />
          <ShortcutRow keys="2" meaning="Hard" />
          <ShortcutRow keys="3" meaning="Good" />
          <ShortcutRow keys="4" meaning="Easy" />
          <ShortcutRow keys="Esc" meaning="Exit review mode" />
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ keys, meaning }: { keys: string; meaning: string }) {
  return (
    <div className="flex items-center justify-between rounded-[1.2rem] border border-line bg-white/82 px-4 py-3">
      <span className="font-semibold text-foreground">{meaning}</span>
      <kbd className="rounded-full bg-background-soft px-3 py-1 text-xs text-muted">{keys}</kbd>
    </div>
  );
}

function RichContent({ html }: { html: string }) {
  return <div className="rich-content" dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />;
}
