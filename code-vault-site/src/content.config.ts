/**
 * src/content.config.ts
 * Astro 6 Content Layer API
 *
 * Collections:
 *   artifacts   — individual artifact meta.json files (from vault extractor output)
 *   manifest    — top-level vault/manifest.json (single file, single entry)
 *   graph       — graph/nodes.json for Graphify topology data
 *
 * Data layout (drop vault/ ZIP contents into src/data/):
 *   src/data/artifacts/<lang>/<slug>.meta.json
 *   src/data/manifest.json
 *   src/data/graph/nodes.json
 *   src/data/graph/edges.json
 */

import { defineCollection }   from 'astro:content';
import { glob, file }         from 'astro/loaders';
import { z }                  from 'astro/zod';

// ─── Shared enums ─────────────────────────────────────────────────────────────

const ArtifactSource = z.enum(['antArtifact', 'fenced']);

const ArtifactLang = z.enum([
  'html', 'jsx', 'tsx', 'js', 'ts',
  'py', 'sql', 'css', 'json', 'md',
  'sh', 'astro', 'svelte', 'vue', 'text',
]).or(z.string()); // forward-compat for new langs

// ─── artifacts collection ─────────────────────────────────────────────────────
// One entry per .meta.json file produced by the vault extractor.
// Glob pattern picks up all languages in one collection.

const artifacts = defineCollection({
  loader: glob({
    pattern: '**/*.meta.json',
    base:    './src/data/artifacts',
  }),
  schema: z.object({
    /** Stable uid from the extractor (art-xxxxxxxx or blk-xxxxxxxx) */
    id:          z.string(),

    /** Human-readable display title */
    title:       z.string(),

    /** URL-safe slug — used for static route params */
    slug:        z.string(),

    /** Lowercase language key (html, jsx, py, …) */
    lang:        ArtifactLang,

    /** Display label (HTML, React, Python, …) */
    lang_label:  z.string(),

    /** File extension for the artifact source file */
    ext:         z.string(),

    /**
     * True = can be safely srcdoc'd into a sandboxed iframe.
     * Drives thumbnail rendering strategy.
     */
    renderable:  z.boolean(),

    /** Which extraction method produced this artifact */
    source:      ArtifactSource,

    /** Raw character count of the artifact code */
    char_len:    z.number().int().nonnegative(),

    /** Line count */
    line_count:  z.number().int().nonnegative(),

    /** Inferred topic tags: language, framework, project area */
    tags:        z.array(z.string()).default([]),

    /** Source conversation id from the exporter */
    conv_id:     z.string(),

    /** Source conversation display title */
    conv_title:  z.string(),

    /** ISO timestamp — null when conversation had no date metadata */
    created_at:  z.string().nullable().default(null),
  }),
});

// ─── manifest collection ──────────────────────────────────────────────────────
// Single file() loader over src/data/manifest.json.
// Used by the index page stats bar and API endpoints.

const manifest = defineCollection({
  loader: file('./src/data/manifest.json'),
  schema: z.object({
    id:                   z.string(),  // file() requires an id field; add "id":"vault" to manifest.json
    generated_at:         z.string(),
    total_conversations:  z.number().int(),
    total_artifacts:      z.number().int(),
    renderable_count:     z.number().int(),
    by_lang:              z.record(z.string(), z.number()),
  }),
});

// ─── graph collection ─────────────────────────────────────────────────────────
// Graphify node data — loaded for the /graph page and the API endpoint.

const GraphNodeType = z.enum(['conversation', 'artifact']);

const graphNodes = defineCollection({
  loader: file('./src/data/graph/nodes.json'),
  schema: z.object({
    id:         z.string(),
    type:       GraphNodeType,
    label:      z.string(),
    group:      z.string(),
    lang:       z.string().optional(),
    renderable: z.boolean().optional(),
    char_len:   z.number().optional(),
    tags:       z.array(z.string()).optional(),
  }),
});

// ─── graphEdges collection ────────────────────────────────────────────────────

const graphEdges = defineCollection({
  loader: file('./src/data/graph/edges.json'),
  schema: z.object({
    id:     z.string(),      // add synthetic id: `${source}__${target}` in ingest script
    source: z.string(),
    target: z.string(),
    rel:    z.string(),
    weight: z.number().default(1),
  }),
});

// ─── Export ───────────────────────────────────────────────────────────────────

export const collections = {
  artifacts,
  manifest,
  graphNodes,
  graphEdges,
};
