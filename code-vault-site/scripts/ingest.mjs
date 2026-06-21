#!/usr/bin/env node
/**
 * scripts/ingest.mjs
 * Converts Code Vault Extractor ZIP output into Astro content collection data.
 *
 * Usage:
 *   node scripts/ingest.mjs                         # reads vault/ in CWD
 *   node scripts/ingest.mjs --src /path/to/vault    # explicit vault dir
 *   node scripts/ingest.mjs --watch                 # re-ingest on changes
 *
 * What it does:
 *   1. Reads all vault/artifacts/<lang>/*.meta.json files
 *   2. Adds synthetic `id` field = slug (required by Astro file() loader)
 *   3. Copies them to src/data/artifacts/<lang>/
 *   4. Reads vault/manifest.json → src/data/manifest.json (with id:"vault")
 *   5. Reads vault/graph/nodes.json + edges.json
 *      - Adds synthetic `id` fields where missing
 *      → src/data/graph/nodes.json + edges.json
 *   6. Copies artifact source files to public/artifacts/<lang>/
 *      (so iframe src="/artifacts/<lang>/<slug>.<ext>" works)
 */

import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
import { existsSync }   from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..');

const args    = process.argv.slice(2);
const watch   = args.includes('--watch');
const srcIdx  = args.indexOf('--src');
const VAULT   = srcIdx >= 0 ? args[srcIdx + 1] : join(ROOT, 'vault');
const DATA    = join(ROOT, 'src', 'data');
const PUBLIC  = join(ROOT, 'public', 'artifacts');

// ─── helpers ──────────────────────────────────────────────────────────────────

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function readJSON(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

async function writeJSON(p, data) {
  await ensureDir(dirname(p));
  await writeFile(p, JSON.stringify(data, null, 2), 'utf8');
}

function uid(n = 8) {
  return Math.random().toString(36).slice(2, 2 + n);
}

// ─── ingest ───────────────────────────────────────────────────────────────────

async function ingest() {
  if (!existsSync(VAULT)) {
    console.error(`[ingest] vault dir not found: ${VAULT}`);
    console.error(`[ingest] Run the vault-ui.html extractor first, then unzip to ${VAULT}/`);
    process.exit(1);
  }

  console.log(`[ingest] source: ${VAULT}`);
  let count = 0;

  // ── 1. Artifact meta.json files ──────────────────────────────────────────
  const artifactsDir = join(VAULT, 'artifacts');
  if (existsSync(artifactsDir)) {
    const langs = await readdir(artifactsDir);
    for (const lang of langs) {
      const langDir    = join(artifactsDir, lang);
      const destDir    = join(DATA, 'artifacts', lang);
      const pubLangDir = join(PUBLIC, lang);
      await ensureDir(destDir);
      await ensureDir(pubLangDir);

      const files = await readdir(langDir);
      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;

        const src  = join(langDir, file);
        const dest = join(destDir, file);
        const meta = await readJSON(src);

        // Astro file() loader requires an `id` field
        if (!meta.id) meta.id = meta.slug ?? basename(file, '.meta.json');

        await writeJSON(dest, meta);
        count++;

        // Copy the corresponding source file to public/artifacts/<lang>/
        const srcFile  = join(langDir, `${meta.slug}.${meta.ext}`);
        const destFile = join(pubLangDir, `${meta.slug}.${meta.ext}`);
        if (existsSync(srcFile)) {
          await copyFile(srcFile, destFile);
        }
      }
    }
  }
  console.log(`[ingest] ${count} artifact meta files processed`);

  // ── 2. manifest.json ─────────────────────────────────────────────────────
  const manifestSrc = join(VAULT, 'manifest.json');
  if (existsSync(manifestSrc)) {
    const manifest = await readJSON(manifestSrc);
    // file() loader: needs an `id` field at top level
    if (!manifest.id) manifest.id = 'vault';
    // Remove code bodies if present (they're not in meta.json but just in case)
    if (manifest.artifacts) {
      manifest.artifacts = manifest.artifacts.map(a => {
        const { code: _code, ...rest } = a;
        return rest;
      });
    }
    // Astro file() loader requires an array of objects each with 'id'
    await writeJSON(join(DATA, 'manifest.json'), [manifest]);
    console.log('[ingest] manifest.json written');
  } else {
    // Write a minimal stub so collection doesn't blow up
    await writeJSON(join(DATA, 'manifest.json'), [{
      id:                  'vault',
      generated_at:        new Date().toISOString(),
      total_conversations: 0,
      total_artifacts:     count,
      renderable_count:    0,
      by_lang:             {},
    }]);
    console.log('[ingest] manifest.json stub written (no source manifest found)');
  }

  // ── 3. graph nodes + edges ───────────────────────────────────────────────
  const graphDir = join(VAULT, 'graph');
  if (existsSync(graphDir)) {
    const nodesSrc = join(graphDir, 'nodes.json');
    const edgesSrc = join(graphDir, 'edges.json');
    await ensureDir(join(DATA, 'graph'));

    if (existsSync(nodesSrc)) {
      const nodes = await readJSON(nodesSrc);
      // Ensure each node has a top-level `id` (some may already; file() loader needs it)
      const normalised = nodes.map(n => ({ id: n.id ?? uid(), ...n }));
      await writeJSON(join(DATA, 'graph', 'nodes.json'), normalised);
      console.log(`[ingest] ${normalised.length} graph nodes written`);
    }

    if (existsSync(edgesSrc)) {
      const edges = await readJSON(edgesSrc);
      // Synthetic edge id: "<source>__<target>" (truncated, deduped)
      const seen = new Set();
      const normalised = edges
        .map(e => {
          const baseId = `${e.source}__${e.target}`.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80);
          let id = baseId;
          let n  = 2;
          while (seen.has(id)) id = `${baseId}-${n++}`;
          seen.add(id);
          return { id, ...e };
        });
      await writeJSON(join(DATA, 'graph', 'edges.json'), normalised);
      console.log(`[ingest] ${normalised.length} graph edges written`);
    }
  } else {
    // Stub empty graph files
    await ensureDir(join(DATA, 'graph'));
    await writeJSON(join(DATA, 'graph', 'nodes.json'), []);
    await writeJSON(join(DATA, 'graph', 'edges.json'), []);
    console.log('[ingest] graph stubs written (no vault/graph/ dir found)');
  }

  console.log('[ingest] ✓ done — run `npm run dev` or `npm run build`');
}

// ─── watch mode ───────────────────────────────────────────────────────────────

if (watch) {
  const { default: chokidar } = await import('chokidar');
  console.log(`[ingest:watch] watching ${VAULT}/**`);
  await ingest();
  chokidar
    .watch(join(VAULT, '**/*.json'), { ignoreInitial: true })
    .on('all', async (event, path) => {
      console.log(`[ingest:watch] ${event}: ${path}`);
      await ingest();
    });
} else {
  await ingest();
}
