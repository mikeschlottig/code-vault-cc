/**
 * src/lib/artifacts.ts
 * Shared query helpers over the artifacts content collection.
 * All functions are pure — no side effects, safe to call in getStaticPaths.
 */

import { getCollection }       from 'astro:content';
import type { ArtifactEntry }  from './types';
import { ITEMS_PER_PAGE }      from './types';

// ─── Base fetch ───────────────────────────────────────────────────────────────

/** Fetch all artifacts, newest-first by default. */
export async function getAllArtifacts(): Promise<ArtifactEntry[]> {
  const entries = await getCollection('artifacts');
  return entries.sort((a, b) => {
    const da = a.data.created_at ? new Date(a.data.created_at).getTime() : 0;
    const db = b.data.created_at ? new Date(b.data.created_at).getTime() : 0;
    return db - da;
  });
}

/** Fetch only renderable (iframe-able) artifacts. */
export async function getRenderableArtifacts(): Promise<ArtifactEntry[]> {
  const all = await getAllArtifacts();
  return all.filter(e => e.data.renderable);
}

/** Fetch a single artifact by its slug. */
export async function getArtifactBySlug(slug: string): Promise<ArtifactEntry | undefined> {
  const all = await getAllArtifacts();
  return all.find(e => e.data.slug === slug);
}

// ─── Derived indexes ──────────────────────────────────────────────────────────

/** All distinct language keys present in the collection. */
export async function getAllLangs(): Promise<string[]> {
  const all = await getAllArtifacts();
  return [...new Set(all.map(e => e.data.lang))].sort();
}

/** All distinct tags present in the collection, sorted by frequency. */
export async function getAllTags(): Promise<Array<{ tag: string; count: number }>> {
  const all = await getAllArtifacts();
  const counts = new Map<string, number>();
  for (const e of all) {
    for (const tag of e.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** All distinct conversation ids + titles for the "by conversation" index. */
export async function getConversationIndex(): Promise<
  Array<{ conv_id: string; conv_title: string; count: number }>
> {
  const all = await getAllArtifacts();
  const map = new Map<string, { conv_title: string; count: number }>();
  for (const e of all) {
    const { conv_id, conv_title } = e.data;
    const existing = map.get(conv_id);
    if (existing) existing.count++;
    else map.set(conv_id, { conv_title, count: 1 });
  }
  return [...map.entries()]
    .map(([conv_id, v]) => ({ conv_id, ...v }))
    .sort((a, b) => b.count - a.count);
}

// ─── Pagination helper ────────────────────────────────────────────────────────

export interface PaginatedArtifacts {
  items:        ArtifactEntry[];
  currentPage:  number;
  totalPages:   number;
  totalItems:   number;
  hasNext:      boolean;
  hasPrev:      boolean;
}

export function paginate(
  items: ArtifactEntry[],
  page:  number,
  perPage: number = ITEMS_PER_PAGE,
): PaginatedArtifacts {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safeP      = Math.min(Math.max(1, page), totalPages);
  const start      = (safeP - 1) * perPage;
  return {
    items:       items.slice(start, start + perPage),
    currentPage: safeP,
    totalPages,
    totalItems,
    hasNext:     safeP < totalPages,
    hasPrev:     safeP > 1,
  };
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

export interface VaultStats {
  total:        number;
  renderable:   number;
  languages:    number;
  conversations: number;
  totalChars:   number;
  byLang:       Record<string, number>;
  topTags:      Array<{ tag: string; count: number }>;
}

export async function getVaultStats(): Promise<VaultStats> {
  const all    = await getAllArtifacts();
  const tags   = await getAllTags();
  const convs  = await getConversationIndex();

  const byLang: Record<string, number> = {};
  let totalChars = 0;
  for (const e of all) {
    byLang[e.data.lang] = (byLang[e.data.lang] ?? 0) + 1;
    totalChars += e.data.char_len;
  }

  return {
    total:         all.length,
    renderable:    all.filter(e => e.data.renderable).length,
    languages:     Object.keys(byLang).length,
    conversations: convs.length,
    totalChars,
    byLang,
    topTags:       tags.slice(0, 20),
  };
}

// ─── Static paths generators ──────────────────────────────────────────────────
// Used by getStaticPaths() in dynamic route files.

/** /vault/[slug] — one path per artifact */
export async function artifactStaticPaths() {
  const all = await getAllArtifacts();
  return all.map(entry => ({
    params: { slug: entry.data.slug },
    props:  { entry },
  }));
}

/** /vault/lang/[lang]/[page] — paginated per-language indexes */
export async function langStaticPaths(perPage = ITEMS_PER_PAGE) {
  const all   = await getAllArtifacts();
  const langs = await getAllLangs();

  return langs.flatMap(lang => {
    const filtered = all.filter(e => e.data.lang === lang);
    const total    = Math.max(1, Math.ceil(filtered.length / perPage));
    return Array.from({ length: total }, (_, i) => ({
      params: { lang, page: String(i + 1) },
      props:  { lang, page: i + 1, entries: filtered, totalPages: total },
    }));
  });
}

/** /vault/tag/[tag]/[page] — paginated per-tag indexes */
export async function tagStaticPaths(perPage = ITEMS_PER_PAGE) {
  const all  = await getAllArtifacts();
  const tags = await getAllTags();

  return tags.flatMap(({ tag }) => {
    const filtered = all.filter(e => e.data.tags.includes(tag));
    const total    = Math.max(1, Math.ceil(filtered.length / perPage));
    return Array.from({ length: total }, (_, i) => ({
      params: { tag, page: String(i + 1) },
      props:  { tag, page: i + 1, entries: filtered, totalPages: total },
    }));
  });
}

/** /vault/conversation/[conv_id]/[page] — artifacts from one source conversation */
export async function conversationStaticPaths(perPage = ITEMS_PER_PAGE) {
  const all   = await getAllArtifacts();
  const convs = await getConversationIndex();

  return convs.flatMap(({ conv_id }) => {
    const filtered = all.filter(e => e.data.conv_id === conv_id);
    const total    = Math.max(1, Math.ceil(filtered.length / perPage));
    return Array.from({ length: total }, (_, i) => ({
      params: { conv_id, page: String(i + 1) },
      props:  {
        conv_id,
        conv_title: filtered[0]?.data.conv_title ?? conv_id,
        page: i + 1,
        entries: filtered,
        totalPages: total,
      },
    }));
  });
}
