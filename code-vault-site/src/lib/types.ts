/**
 * src/lib/types.ts
 * Re-exports CollectionEntry types and derives convenience types used
 * across pages and components.
 */

import type { CollectionEntry } from 'astro:content';

// ─── Collection entry types ───────────────────────────────────────────────────

export type ArtifactEntry    = CollectionEntry<'artifacts'>;
export type ManifestEntry    = CollectionEntry<'manifest'>;
export type GraphNodeEntry   = CollectionEntry<'graphNodes'>;
export type GraphEdgeEntry   = CollectionEntry<'graphEdges'>;

// ─── Artifact data shape (unwrapped) ─────────────────────────────────────────

export type ArtifactData = ArtifactEntry['data'];

// ─── Lang metadata ────────────────────────────────────────────────────────────

export type ArtifactLang =
  | 'html' | 'jsx' | 'tsx'
  | 'js'   | 'ts'
  | 'py'   | 'sql'
  | 'css'  | 'json'
  | 'md'   | 'sh'
  | 'astro'| 'svelte' | 'vue'
  | 'text' | (string & {});

export const LANG_META: Record<string, { label: string; color: string; bg: string }> = {
  html:   { label: 'HTML',       color: '#c94a2f', bg: '#fce8e5' },
  jsx:    { label: 'React',      color: '#5c3dbf', bg: '#eeebfc' },
  tsx:    { label: 'React TS',   color: '#5c3dbf', bg: '#eeebfc' },
  js:     { label: 'JavaScript', color: '#b8860b', bg: '#fef8e0' },
  ts:     { label: 'TypeScript', color: '#3a5fcd', bg: '#e8eefb' },
  py:     { label: 'Python',     color: '#0f7a68', bg: '#d8f0ec' },
  sql:    { label: 'SQL',        color: '#d4820a', bg: '#fef3dc' },
  css:    { label: 'CSS',        color: '#e91e8c', bg: '#fde8f3' },
  json:   { label: 'JSON',       color: '#555',    bg: '#f0ede6' },
  md:     { label: 'Markdown',   color: '#666',    bg: '#f0ede6' },
  sh:     { label: 'Shell',      color: '#333',    bg: '#eeecea' },
  astro:  { label: 'Astro',      color: '#ff5d01', bg: '#fff0ea' },
  svelte: { label: 'Svelte',     color: '#ff3e00', bg: '#fff1ee' },
  vue:    { label: 'Vue',        color: '#41b883', bg: '#e8f8ef' },
  text:   { label: 'Text',       color: '#888',    bg: '#f4f2ed' },
};

export function getLangMeta(lang: string) {
  return LANG_META[lang] ?? { label: lang.toUpperCase(), color: '#888', bg: '#f4f2ed' };
}

// ─── Filter / sort state ─────────────────────────────────────────────────────

export type SortKey = 'date-desc' | 'date-asc' | 'size-desc' | 'size-asc' | 'lang' | 'title';

export interface FilterState {
  query:          string;
  lang:           string;
  tags:           string[];
  renderableOnly: boolean;
  sourceFilter:   'all' | 'antArtifact' | 'fenced';
  sort:           SortKey;
}

export const DEFAULT_FILTER: FilterState = {
  query:          '',
  lang:           '',
  tags:           [],
  renderableOnly: false,
  sourceFilter:   'all',
  sort:           'date-desc',
};

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PageInfo {
  currentPage:  number;
  totalPages:   number;
  totalItems:   number;
  itemsPerPage: number;
  hasNext:      boolean;
  hasPrev:      boolean;
}

export const ITEMS_PER_PAGE = 48;

// ─── Graph ────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id:         string;
  type:       'conversation' | 'artifact';
  label:      string;
  group:      string;
  lang?:      string;
  renderable?: boolean;
  char_len?:  number;
  tags?:      string[];
}

export interface GraphEdge {
  id:     string;
  source: string;
  target: string;
  rel:    string;
  weight: number;
}
