/**
 * Claude Code Vault Extractor
 * Drop-in enhancement for claude.ai conversation exporter
 * Extracts: antArtifact blocks, fenced code blocks, renderable HTML
 * Outputs: structured JSON manifest + individual files
 */

// ─── Type detection ────────────────────────────────────────────────────────
const LANG_MAP = {
  html: { ext: 'html', renderable: true,  label: 'HTML' },
  htm:  { ext: 'html', renderable: true,  label: 'HTML' },
  jsx:  { ext: 'jsx',  renderable: true,  label: 'React' },
  tsx:  { ext: 'tsx',  renderable: true,  label: 'React TS' },
  js:   { ext: 'js',   renderable: false, label: 'JavaScript' },
  ts:   { ext: 'ts',   renderable: false, label: 'TypeScript' },
  py:   { ext: 'py',   renderable: false, label: 'Python' },
  python: { ext: 'py', renderable: false, label: 'Python' },
  sql:  { ext: 'sql',  renderable: false, label: 'SQL' },
  css:  { ext: 'css',  renderable: false, label: 'CSS' },
  json: { ext: 'json', renderable: false, label: 'JSON' },
  md:   { ext: 'md',   renderable: false, label: 'Markdown' },
  bash: { ext: 'sh',   renderable: false, label: 'Shell' },
  sh:   { ext: 'sh',   renderable: false, label: 'Shell' },
  astro:{ ext: 'astro',renderable: false, label: 'Astro' },
  svelte:{ext:'svelte', renderable: false, label: 'Svelte' },
  vue:  { ext: 'vue',  renderable: false, label: 'Vue' },
};

const ARTIFACT_TITLE_RE = /identifier="([^"]+)"/;
const ARTIFACT_TYPE_RE  = /type="([^"]+)"/;

// ─── Renderable HTML heuristics ────────────────────────────────────────────
function isRenderableHTML(code, lang) {
  if (lang === 'html' || lang === 'htm') return true;
  if (lang === 'jsx' || lang === 'tsx') return true;
  if (!lang) {
    // sniff
    return /<html|<!DOCTYPE|<body|<div|<canvas/i.test(code.slice(0, 400));
  }
  return false;
}

// ─── Tag generator ─────────────────────────────────────────────────────────
function inferTags(code, lang, title) {
  const tags = new Set();
  const haystack = (code + ' ' + (title || '')).toLowerCase();
  const rules = [
    ['cloudflare', /cloudflare|workers|d1 |kv |r2 |durable|wrangler/],
    ['astro',      /astro|\.astro|getstaticpaths|getstaticprops/],
    ['react',      /usestate|useeffect|jsx|react|import.*from.*react/],
    ['duckdb',     /duckdb|read_json|read_parquet/],
    ['graphify',   /graphify|node graph|\.graphml|gephi/],
    ['local-seo',  /local seo|gbp|geo keyword|mapranks|rank grid/],
    ['agentic',    /agent|orchestrat|multi.agent|langgraph|pocketflow/],
    ['python',     /import |def |class |print\(/],
    ['analytics',  /analytics|dashboard|chart|recharts|d3\./],
    ['email',      /email|smtp|sendgrid|instantly|mailgun/],
    ['scraper',    /scraper|apify|playwright|puppeteer|crawl/],
  ];
  if (lang) tags.add(lang.toLowerCase());
  for (const [tag, re] of rules) {
    if (re.test(haystack)) tags.add(tag);
  }
  return [...tags];
}

// ─── Slug generator ────────────────────────────────────────────────────────
function slugify(str) {
  return (str || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function nanoid(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len);
}

// ─── Core extraction ───────────────────────────────────────────────────────
/**
 * Extract all code artifacts from a single conversation object.
 * Works with the JSON format produced by the existing exporter.
 *
 * @param {Object} conv  - conversation object { id, title, created_at, messages[] }
 * @returns {Array}      - array of artifact records
 */
export function extractArtifacts(conv) {
  const artifacts = [];
  const convId    = conv.id || nanoid();
  const convTitle = conv.title || 'Untitled';

  for (const msg of (conv.messages || [])) {
    if (msg.role !== 'assistant') continue;

    const rawContent = Array.isArray(msg.content)
      ? msg.content.map(c => (typeof c === 'string' ? c : c.text || '')).join('\n')
      : (msg.content || '');

    // 1. antArtifact blocks (highest fidelity)
    extractAntArtifacts(rawContent, conv, msg, artifacts);

    // 2. Fenced code blocks not inside antArtifact
    extractFencedBlocks(rawContent, conv, msg, artifacts);
  }

  // Deduplicate by content hash (same block sometimes appears in streaming chunks)
  return deduplicateArtifacts(artifacts);
}

function extractAntArtifacts(rawContent, conv, msg, out) {
  // Match both self-closing and paired antArtifact tags
  const re = /<antArtifact([^>]*)>([\s\S]*?)<\/antArtifact>/gi;
  let m;
  while ((m = re.exec(rawContent)) !== null) {
    const attrs = m[1];
    const code  = m[2].trim();
    if (!code) continue;

    const idMatch    = /\bidentifier="([^"]+)"/.exec(attrs);
    const typeMatch  = /\btype="([^"]+)"/.exec(attrs);
    const titleMatch = /\btitle="([^"]+)"/.exec(attrs);
    const langMatch  = /\blanguage="([^"]+)"/.exec(attrs);

    const rawLang = langMatch?.[1] || deriveLanguageFromType(typeMatch?.[1] || '', code);
    const langInfo = LANG_MAP[rawLang?.toLowerCase()] || { ext: 'txt', renderable: false, label: rawLang || 'unknown' };
    const title    = titleMatch?.[1] || idMatch?.[1] || `artifact-${nanoid(6)}`;

    out.push({
      id:           `art-${nanoid(8)}`,
      source:       'antArtifact',
      conv_id:      conv.id,
      conv_title:   conv.title || 'Untitled',
      msg_id:       msg.id || null,
      created_at:   msg.created_at || conv.created_at || null,
      title,
      slug:         slugify(title),
      lang:         rawLang || 'text',
      lang_label:   langInfo.label,
      ext:          langInfo.ext,
      renderable:   langInfo.renderable || isRenderableHTML(code, rawLang),
      char_len:     code.length,
      line_count:   code.split('\n').length,
      tags:         inferTags(code, rawLang, title),
      code,
    });
  }
}

function extractFencedBlocks(rawContent, conv, msg, out) {
  // Strip antArtifact sections first to avoid double-extraction
  const stripped = rawContent.replace(/<antArtifact[\s\S]*?<\/antArtifact>/gi, '');

  const re = /```([a-zA-Z0-9._-]*)\n([\s\S]*?)```/g;
  let m;
  let idx = 0;
  while ((m = re.exec(stripped)) !== null) {
    const rawLang  = m[1].trim().toLowerCase();
    const code     = m[2].trim();
    if (!code || code.length < 40) continue; // skip trivial snippets

    const langInfo = LANG_MAP[rawLang] || { ext: rawLang || 'txt', renderable: false, label: rawLang || 'text' };
    const title    = `${slugify(conv.title || 'conv')}-block-${idx++}`;

    out.push({
      id:           `blk-${nanoid(8)}`,
      source:       'fenced',
      conv_id:      conv.id,
      conv_title:   conv.title || 'Untitled',
      msg_id:       msg.id || null,
      created_at:   msg.created_at || conv.created_at || null,
      title,
      slug:         title,
      lang:         rawLang || 'text',
      lang_label:   langInfo.label,
      ext:          langInfo.ext,
      renderable:   isRenderableHTML(code, rawLang),
      char_len:     code.length,
      line_count:   code.split('\n').length,
      tags:         inferTags(code, rawLang, ''),
      code,
    });
  }
}

function deriveLanguageFromType(type, code) {
  if (type.includes('react') || type.includes('jsx')) return 'jsx';
  if (type.includes('html') || type.includes('svg'))  return 'html';
  if (type.includes('python'))                         return 'py';
  if (type.includes('javascript') || type.includes('code/js')) return 'js';
  if (type.includes('typescript')) return 'ts';
  // sniff
  if (/<html|<!DOCTYPE|<body/i.test(code.slice(0, 200))) return 'html';
  if (/^import React|from 'react'|from "react"/.test(code.slice(0, 100))) return 'jsx';
  return '';
}

function deduplicateArtifacts(artifacts) {
  const seen = new Set();
  return artifacts.filter(a => {
    const key = a.code.slice(0, 120).replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Batch processor ───────────────────────────────────────────────────────
/**
 * Process an array of conversations and return the full manifest.
 * @param {Array} conversations
 * @returns {{ manifest: Object, artifacts: Array }}
 */
export function processBatch(conversations) {
  const allArtifacts = [];
  for (const conv of conversations) {
    const arts = extractArtifacts(conv);
    allArtifacts.push(...arts);
  }

  const manifest = {
    generated_at: new Date().toISOString(),
    total_conversations: conversations.length,
    total_artifacts: allArtifacts.length,
    renderable_count: allArtifacts.filter(a => a.renderable).length,
    by_lang: Object.fromEntries(
      [...new Set(allArtifacts.map(a => a.lang))]
        .map(l => [l, allArtifacts.filter(a => a.lang === l).length])
        .sort((a, b) => b[1] - a[1])
    ),
    artifacts: allArtifacts.map(a => ({ ...a, code: undefined })), // manifest sans code
  };

  return { manifest, artifacts: allArtifacts };
}

// ─── ZIP builder (browser) ─────────────────────────────────────────────────
/**
 * Build a downloadable ZIP containing:
 *   vault/manifest.json
 *   vault/artifacts/<lang>/<slug>.<ext>
 *   vault/artifacts/<lang>/<slug>.meta.json
 *   vault/toc.html (linked table of contents)
 *
 * Requires fflate (loaded globally as window.fflate)
 */
export async function buildVaultZip(artifacts, manifest, options = {}) {
  const { fflate } = window;
  if (!fflate) throw new Error('fflate not loaded');

  const { renderableOnly = false } = options;
  const subset = renderableOnly ? artifacts.filter(a => a.renderable) : artifacts;

  const files = {};
  const enc = s => fflate.strToU8(s);

  // manifest
  files['vault/manifest.json'] = enc(JSON.stringify(manifest, null, 2));

  // individual artifact files
  for (const art of subset) {
    const dir = `vault/artifacts/${art.lang}/`;
    files[`${dir}${art.slug}.${art.ext}`] = enc(art.code);
    files[`${dir}${art.slug}.meta.json`]  = enc(JSON.stringify({
      id: art.id,
      title: art.title,
      conv_id: art.conv_id,
      conv_title: art.conv_title,
      lang: art.lang,
      lang_label: art.lang_label,
      renderable: art.renderable,
      char_len: art.char_len,
      line_count: art.line_count,
      tags: art.tags,
      created_at: art.created_at,
    }, null, 2));
  }

  // TOC html
  files['vault/toc.html'] = enc(buildTOCHTML(subset, manifest));

  // Graphify nodes.json
  files['vault/graph/nodes.json'] = enc(JSON.stringify(buildGraphNodes(subset), null, 2));
  files['vault/graph/edges.json'] = enc(JSON.stringify(buildGraphEdges(subset), null, 2));

  // DuckDB query helpers
  files['vault/queries/top_types.sql']   = enc(TOP_TYPES_SQL);
  files['vault/queries/renderables.sql'] = enc(RENDERABLES_SQL);
  files['vault/queries/by_tag.sql']      = enc(BY_TAG_SQL);
  files['vault/queries/timeline.sql']    = enc(TIMELINE_SQL);

  return new Promise((resolve, reject) => {
    fflate.zip(files, { level: 6 }, (err, data) => {
      if (err) return reject(err);
      resolve(new Blob([data], { type: 'application/zip' }));
    });
  });
}

// ─── TOC HTML generator ────────────────────────────────────────────────────
function buildTOCHTML(artifacts, manifest) {
  const renderableArts = artifacts.filter(a => a.renderable);
  const otherArts      = artifacts.filter(a => !a.renderable);

  const langColors = {
    html: '#c94a2f', jsx: '#5c3dbf', tsx: '#5c3dbf',
    py: '#0f7a68', sql: '#d4820a', js: '#b8860b',
    ts: '#3a5fcd', css: '#e91e8c', md: '#555', sh: '#333',
  };

  const card = (a) => `
<div class="card ${a.renderable ? 'renderable' : ''}" data-lang="${a.lang}" data-tags="${a.tags.join(' ')}">
  <div class="card-header">
    <span class="badge" style="background:${langColors[a.lang] || '#888'}">${a.lang_label}</span>
    ${a.renderable ? '<span class="badge-render">⬜ renderable</span>' : ''}
  </div>
  ${a.renderable
    ? `<div class="thumb-wrap">
         <iframe src="artifacts/${a.lang}/${a.slug}.${a.ext}"
                 sandbox="allow-scripts"
                 loading="lazy"
                 title="${escHTML(a.title)}"></iframe>
         <div class="thumb-overlay"></div>
       </div>`
    : `<div class="code-preview"><pre>${escHTML(a.code.slice(0, 280))}${a.code.length > 280 ? '…' : ''}</pre></div>`
  }
  <div class="card-body">
    <div class="card-title">${escHTML(a.title)}</div>
    <div class="card-meta">${escHTML(a.conv_title)} · ${a.char_len.toLocaleString()} chars · ${a.line_count} lines</div>
    <div class="tags">${a.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
  </div>
  <div class="card-actions">
    <a href="artifacts/${a.lang}/${a.slug}.${a.ext}" target="_blank">Open ↗</a>
    <a href="artifacts/${a.lang}/${a.slug}.meta.json">Meta</a>
  </div>
</div>`;

  const filterBar = `
<div id="filters">
  <input type="text" id="search" placeholder="Search title, tags, language…" oninput="filterCards()">
  <div id="lang-filters">
    ${[...new Set(artifacts.map(a => a.lang))].sort().map(l =>
      `<button class="filter-btn" onclick="toggleLang('${l}')" data-lang="${l}">${l}</button>`
    ).join('')}
  </div>
  <label><input type="checkbox" id="only-renderable" onchange="filterCards()"> Renderable only</label>
</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Code Vault — ${manifest.total_artifacts} artifacts</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #f4f2ed; --surface: #fff; --border: #e0ddd5;
    --ink: #111; --muted: #666; --amber: #d4820a;
    --mono: 'Courier New', monospace;
  }
  body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--ink); }
  header { padding: 1.5rem 2rem; border-bottom: 1px solid var(--border); background: var(--surface); }
  header h1 { font-size: 1.4rem; font-weight: 700; }
  header p  { color: var(--muted); font-size: 0.85rem; margin-top: 4px; }
  .stats { display: flex; gap: 1.5rem; margin-top: 0.75rem; }
  .stat-num { font-size: 1.2rem; font-weight: 700; color: var(--amber); }
  .stat-label { font-size: 0.75rem; color: var(--muted); }
  #filters { padding: 1rem 2rem; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: var(--surface); border-bottom: 1px solid var(--border); }
  #search { flex: 1; min-width: 200px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.85rem; }
  #lang-filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .filter-btn { padding: 4px 10px; border: 1px solid var(--border); border-radius: 3px; font-size: 0.75rem; cursor: pointer; background: var(--bg); transition: all 0.1s; }
  .filter-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; padding: 1.5rem 2rem; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.15s; }
  .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .card.hidden { display: none; }
  .card-header { display: flex; gap: 6px; padding: 8px 12px; align-items: center; border-bottom: 1px solid var(--border); }
  .badge { font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 3px; color: #fff; font-family: var(--mono); }
  .badge-render { font-size: 0.7rem; color: var(--muted); }
  .thumb-wrap { position: relative; height: 160px; overflow: hidden; background: #f9f9f9; }
  .thumb-wrap iframe { width: 100%; height: 100%; border: none; pointer-events: none; transform-origin: top left; }
  .thumb-overlay { position: absolute; inset: 0; }
  .code-preview { height: 120px; overflow: hidden; background: #fafafa; }
  .code-preview pre { font-family: var(--mono); font-size: 0.68rem; padding: 10px 12px; line-height: 1.5; color: var(--muted); white-space: pre-wrap; word-break: break-all; }
  .card-body { padding: 10px 12px; flex: 1; }
  .card-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-meta { font-size: 0.72rem; color: var(--muted); margin-bottom: 6px; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .tag { font-size: 0.65rem; padding: 2px 6px; background: #f0ede6; border-radius: 2px; color: var(--muted); }
  .card-actions { display: flex; gap: 0; border-top: 1px solid var(--border); }
  .card-actions a { flex: 1; text-align: center; padding: 7px; font-size: 0.75rem; color: var(--amber); text-decoration: none; border-right: 1px solid var(--border); }
  .card-actions a:last-child { border-right: none; }
  .card-actions a:hover { background: var(--bg); }
  footer { padding: 1rem 2rem; text-align: center; font-size: 0.75rem; color: var(--muted); border-top: 1px solid var(--border); }
</style>
</head>
<body>
<header>
  <h1>⬛ Code Vault</h1>
  <p>Extracted from Claude conversations — generated ${new Date().toLocaleString()}</p>
  <div class="stats">
    <div><div class="stat-num">${manifest.total_artifacts}</div><div class="stat-label">Total artifacts</div></div>
    <div><div class="stat-num">${manifest.renderable_count}</div><div class="stat-label">Renderable</div></div>
    <div><div class="stat-num">${manifest.total_conversations}</div><div class="stat-label">Source convs</div></div>
    <div><div class="stat-num">${Object.keys(manifest.by_lang).length}</div><div class="stat-label">Languages</div></div>
  </div>
</header>
${filterBar}
<div class="gallery" id="gallery">
  ${artifacts.map(a => card(a)).join('\n')}
</div>
<footer>Code Vault · LeverageAI · DuckDB queries in /vault/queries/ · Graph data in /vault/graph/</footer>
<script>
  let activeLangs = new Set();
  function filterCards() {
    const q = document.getElementById('search').value.toLowerCase();
    const onlyR = document.getElementById('only-renderable').checked;
    document.querySelectorAll('.card').forEach(c => {
      const titleEl = c.querySelector('.card-title');
      const title   = titleEl ? titleEl.textContent.toLowerCase() : '';
      const tags    = (c.dataset.tags || '').toLowerCase();
      const lang    = c.dataset.lang || '';
      const renderable = c.classList.contains('renderable');
      const matchQ  = !q || title.includes(q) || tags.includes(q) || lang.includes(q);
      const matchL  = activeLangs.size === 0 || activeLangs.has(lang);
      const matchR  = !onlyR || renderable;
      c.classList.toggle('hidden', !(matchQ && matchL && matchR));
    });
  }
  function toggleLang(l) {
    const btn = document.querySelector('.filter-btn[data-lang="' + l + '"]');
    if (activeLangs.has(l)) { activeLangs.delete(l); btn.classList.remove('active'); }
    else { activeLangs.add(l); btn.classList.add('active'); }
    filterCards();
  }
<\/script>
</body>
</html>`;
}

function escHTML(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Graphify node/edge builders ───────────────────────────────────────────
function buildGraphNodes(artifacts) {
  const convNodes = {};
  for (const a of artifacts) {
    if (!convNodes[a.conv_id]) {
      convNodes[a.conv_id] = {
        id: `conv:${a.conv_id}`,
        type: 'conversation',
        label: a.conv_title,
        group: 'conversation',
      };
    }
  }
  const artNodes = artifacts.map(a => ({
    id: `art:${a.id}`,
    type: 'artifact',
    label: a.title,
    lang: a.lang,
    renderable: a.renderable,
    char_len: a.char_len,
    group: a.lang,
    tags: a.tags,
  }));
  return [...Object.values(convNodes), ...artNodes];
}

function buildGraphEdges(artifacts) {
  const edges = [];
  const tagIndex = {};
  for (const a of artifacts) {
    edges.push({ source: `conv:${a.conv_id}`, target: `art:${a.id}`, rel: 'produces' });
    for (const tag of a.tags) {
      if (!tagIndex[tag]) tagIndex[tag] = [];
      tagIndex[tag].push(a.id);
    }
  }
  // tag co-occurrence edges (artifacts that share tags)
  for (const [tag, ids] of Object.entries(tagIndex)) {
    if (ids.length > 1 && ids.length < 20) { // skip mega-clusters
      for (let i = 0; i < ids.length - 1; i++) {
        edges.push({ source: `art:${ids[i]}`, target: `art:${ids[i+1]}`, rel: `shares:${tag}`, weight: 0.3 });
      }
    }
  }
  return edges;
}

// ─── DuckDB SQL templates ──────────────────────────────────────────────────
const TOP_TYPES_SQL = `
-- Top artifact types by count and avg size
SELECT lang, lang_label, COUNT(*) n, ROUND(AVG(char_len), 0) avg_chars,
       SUM(CASE WHEN renderable THEN 1 ELSE 0 END) renderable_count
FROM read_json_auto('vault/artifacts/**/*.meta.json')
GROUP BY lang, lang_label
ORDER BY n DESC;
`.trim();

const RENDERABLES_SQL = `
-- All renderable artifacts sorted by size
SELECT id, title, lang, char_len, line_count, conv_title, tags
FROM read_json_auto('vault/artifacts/**/*.meta.json')
WHERE renderable = true
ORDER BY char_len DESC;
`.trim();

const BY_TAG_SQL = `
-- Artifact counts by tag (requires UNNEST)
SELECT tag, COUNT(*) n, ARRAY_AGG(title ORDER BY char_len DESC)[1:3] top3
FROM (
  SELECT title, UNNEST(tags) tag
  FROM read_json_auto('vault/artifacts/**/*.meta.json')
)
GROUP BY tag
ORDER BY n DESC;
`.trim();

const TIMELINE_SQL = `
-- Artifact creation timeline by week
SELECT DATE_TRUNC('week', created_at::TIMESTAMP) wk,
       lang, COUNT(*) n
FROM read_json_auto('vault/artifacts/**/*.meta.json')
WHERE created_at IS NOT NULL
GROUP BY 1, 2
ORDER BY wk DESC;
`.trim();

