import type { CardRecord, DeckNode, ReviewRecord, WorkspaceData } from "@/lib/types";

export function sortNodes(nodes: DeckNode[]) {
  return [...nodes].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.title.localeCompare(right.title);
  });
}

export function getNodeChildren(nodes: DeckNode[], parentId: string | null) {
  return sortNodes(nodes.filter((node) => node.parentId === parentId));
}

export function getDescendantNodeIds(nodes: DeckNode[], nodeId: string) {
  const result = new Set<string>([nodeId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }

  return result;
}

export function getDescendantDeckIds(nodes: DeckNode[], nodeId: string) {
  const nodeIds = getDescendantNodeIds(nodes, nodeId);

  return nodes
    .filter((node) => node.kind === "deck" && nodeIds.has(node.id))
    .map((node) => node.id);
}

export function getNodePath(nodes: DeckNode[], nodeId: string | null) {
  if (!nodeId) {
    return [];
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path: DeckNode[] = [];
  let current = byId.get(nodeId) ?? null;

  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) ?? null : null;
  }

  return path;
}

export function countDueCards(cards: CardRecord[], reviews: Record<string, ReviewRecord>, at = new Date()) {
  const compare = at.getTime();

  return cards.filter((card) => {
    const dueAt = new Date(reviews[card.id]?.dueAt ?? 0).getTime();
    return dueAt <= compare;
  }).length;
}

export function getCardsForNode(data: WorkspaceData, nodeId: string | null) {
  if (!nodeId) {
    return data.cards;
  }

  const deckIds = new Set(getDescendantDeckIds(data.decks, nodeId));
  return data.cards.filter((card) => deckIds.has(card.deckId));
}
