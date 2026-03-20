import { addDays, subDays, subHours } from "date-fns";
import type { AppSession, WorkspaceData } from "@/lib/types";

const demoSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ffd7e6" />
      <stop offset="100%" stop-color="#fff3d8" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" rx="32" fill="url(#g)" />
  <circle cx="162" cy="156" r="72" fill="#ffb6c8" opacity="0.75" />
  <circle cx="460" cy="124" r="92" fill="#ffd68c" opacity="0.55" />
  <path d="M88 248C182 184 258 168 330 190C402 212 462 254 548 244" stroke="#7f5f4d" stroke-width="12" fill="none" stroke-linecap="round" />
  <text x="72" y="82" fill="#6b4f43" font-family="Georgia, serif" font-size="42">Visual mnemonic</text>
  <text x="72" y="120" fill="#8f6b5d" font-family="Verdana, sans-serif" font-size="22">Soft card art can live directly in the editor.</text>
</svg>
`);

const demoImage = `data:image/svg+xml;charset=UTF-8,${demoSvg}`;

export const DEMO_SESSION: AppSession = {
  mode: "demo",
  user: {
    id: "demo-user",
    name: "Demo Learner",
    email: "demo@lilt.study",
    avatarUrl: null,
  },
};

export function createDemoWorkspace(): WorkspaceData {
  const now = new Date();
  const updatedAt = now.toISOString();

  return {
    decks: [
      {
        id: "folder-languages",
        userId: DEMO_SESSION.user.id,
        parentId: null,
        kind: "folder",
        title: "Languages",
        description: "Travel phrases and grammar decks.",
        color: "#f29cb6",
        position: 0,
        createdAt: updatedAt,
        updatedAt,
      },
      {
        id: "deck-german",
        userId: DEMO_SESSION.user.id,
        parentId: "folder-languages",
        kind: "deck",
        title: "German Essentials",
        description: "Daily-use phrases with quick examples.",
        color: "#f8c46f",
        position: 1,
        createdAt: updatedAt,
        updatedAt,
      },
      {
        id: "folder-engineering",
        userId: DEMO_SESSION.user.id,
        parentId: null,
        kind: "folder",
        title: "Frontend Systems",
        description: "Design and engineering recall notes.",
        color: "#a3d7c1",
        position: 2,
        createdAt: updatedAt,
        updatedAt,
      },
      {
        id: "deck-react",
        userId: DEMO_SESSION.user.id,
        parentId: "folder-engineering",
        kind: "deck",
        title: "React Patterns",
        description: "Modern rendering and state-management prompts.",
        color: "#97b8ff",
        position: 3,
        createdAt: updatedAt,
        updatedAt,
      },
    ],
    cards: [
      {
        id: "card-german-1",
        userId: DEMO_SESSION.user.id,
        deckId: "deck-german",
        frontHtml: "<p>How do you say <strong>\"I would like a coffee\"</strong> in German?</p>",
        backHtml:
          "<p><strong>Ich hätte gern einen Kaffee.</strong></p><p><em>Literal:</em> I would happily have a coffee.</p>",
        createdAt: updatedAt,
        updatedAt,
      },
      {
        id: "card-german-2",
        userId: DEMO_SESSION.user.id,
        deckId: "deck-german",
        frontHtml:
          `<p>What image cue helps you remember <strong>Schmetterling</strong>?</p><p><img src="${demoImage}" alt="Mnemonic illustration" /></p>`,
        backHtml:
          "<p><strong>Schmetterling</strong> means <strong>butterfly</strong>.</p><p>Imagine a butterfly drifting through a soft summer garden.</p>",
        createdAt: updatedAt,
        updatedAt,
      },
      {
        id: "card-react-1",
        userId: DEMO_SESSION.user.id,
        deckId: "deck-react",
        frontHtml: "<p>When should you prefer <code>startTransition()</code> in React?</p>",
        backHtml:
          "<p>Use it when an update can be marked as non-urgent so input stays responsive.</p><pre><code>startTransition(() =&gt; setRoute(nextRoute))</code></pre>",
        createdAt: updatedAt,
        updatedAt,
      },
      {
        id: "card-react-2",
        userId: DEMO_SESSION.user.id,
        deckId: "deck-react",
        frontHtml: "<p>Fill in the comparison table for review:</p><table><tbody><tr><th>Hook</th><th>Best for</th></tr><tr><td>useDeferredValue</td><td>?</td></tr><tr><td>useEffectEvent</td><td>?</td></tr></tbody></table>",
        backHtml:
          "<table><tbody><tr><th>Hook</th><th>Best for</th></tr><tr><td>useDeferredValue</td><td>Lag-tolerant derived UI</td></tr><tr><td>useEffectEvent</td><td>Stable event logic inside effects</td></tr></tbody></table>",
        createdAt: updatedAt,
        updatedAt,
      },
    ],
    reviews: {
      "card-german-1": {
        cardId: "card-german-1",
        userId: DEMO_SESSION.user.id,
        state: "review",
        dueAt: subHours(now, 3).toISOString(),
        intervalDays: 5,
        easeFactor: 2.5,
        repetitions: 4,
        lapses: 0,
        lastReviewedAt: subDays(now, 5).toISOString(),
        updatedAt,
      },
      "card-german-2": {
        cardId: "card-german-2",
        userId: DEMO_SESSION.user.id,
        state: "new",
        dueAt: subHours(now, 1).toISOString(),
        intervalDays: 0,
        easeFactor: 2.5,
        repetitions: 0,
        lapses: 0,
        lastReviewedAt: null,
        updatedAt,
      },
      "card-react-1": {
        cardId: "card-react-1",
        userId: DEMO_SESSION.user.id,
        state: "learning",
        dueAt: subHours(now, 2).toISOString(),
        intervalDays: 0,
        easeFactor: 2.3,
        repetitions: 1,
        lapses: 1,
        lastReviewedAt: subHours(now, 10).toISOString(),
        updatedAt,
      },
      "card-react-2": {
        cardId: "card-react-2",
        userId: DEMO_SESSION.user.id,
        state: "review",
        dueAt: addDays(now, 2).toISOString(),
        intervalDays: 8,
        easeFactor: 2.65,
        repetitions: 5,
        lapses: 0,
        lastReviewedAt: subDays(now, 8).toISOString(),
        updatedAt,
      },
    },
    studyEvents: [
      {
        id: "event-demo-1",
        userId: DEMO_SESSION.user.id,
        cardId: "card-react-1",
        deckId: "deck-react",
        rating: "good",
        previousState: "learning",
        studiedAt: subHours(now, 6).toISOString(),
        nextDueAt: addDays(now, 1).toISOString(),
      },
    ],
    updatedAt,
  };
}
