# Code Vault Extractor

Drop-in tools for extracting, browsing, and exporting every code artifact from your Claude (and multi-LLM) conversation exports.

## Files

| File | Purpose |
|------|---------|
| `vault-ui.html` | **Main app** — open in browser, paste JSON, extract, browse, export |
| `extractor.js` | ES module — importable in Node.js / Cloudflare Workers / Astro build scripts |

---

## vault-ui.html — usage

1. Open `vault-ui.html` in any browser (no server needed)
2. Paste your Claude conversation export JSON into the sidebar textarea  
   — OR — load a `.json` file with the file picker
3. Click **⚡ Extract artifacts**
4. Browse / filter / preview in the gallery
5. Export:
   - **Export all (.zip)** — full vault ZIP
   - **Renderable only (.zip)** — iframe-able HTML/JSX only
   - **Export selected** — cherry-pick artifacts

### ZIP contents

```
vault/
  manifest.json              # full index, no code bodies
  toc.html                   # standalone linked TOC, works offline
  artifacts/
    html/
      my-artifact.html
      my-artifact.meta.json
    jsx/
      component.jsx
      component.meta.json
    py/ sql/ ts/ ...
  graph/
    nodes.json               # Graphify-compatible node list
    edges.json               # conv→artifact + tag co-occurrence edges
  queries/
    top_types.sql
    renderables.sql
    by_tag.sql
    timeline.sql
```

---

## extractor.js — Node.js / Astro usage

```js
import { extractArtifacts, processBatch, buildVaultZip } from './extractor.js'

// Single conversation
const artifacts = extractArtifacts(convObject)

// Batch
const { manifest, artifacts } = processBatch(conversations)

// ZIP (browser only, requires fflate on window.fflate)
const blob = await buildVaultZip(artifacts, manifest, { renderableOnly: false })
```

---

## DuckDB — query the manifest

```bash
# Install DuckDB CLI
brew install duckdb   # or apt / winget

# Top languages
duckdb -c "SELECT lang, COUNT(*) n FROM read_json_auto('vault/artifacts/**/*.meta.json') GROUP BY lang ORDER BY n DESC"

# All renderable artifacts
duckdb -c "SELECT title, char_len, conv_title FROM read_json_auto('vault/artifacts/**/*.meta.json') WHERE renderable=true ORDER BY char_len DESC"

# Tag analysis
duckdb -c "SELECT UNNEST(tags) tag, COUNT(*) n FROM read_json_auto('vault/artifacts/**/*.meta.json') GROUP BY tag ORDER BY n DESC"
```

---

## Graphify / Obsidian Canvas

Import `vault/graph/nodes.json` + `edges.json` into Graphify, Gephi, or any force-directed graph tool.

Node types:
- `conversation` — source conversation
- `artifact` — extracted code block

Edge types:
- `produces` — conversation → artifact
- `shares:<tag>` — artifacts that share a topic tag

---

## Astro content collection integration

```ts
// src/content/config.ts
import { defineCollection, z } from 'astro:content'

export const collections = {
  artifacts: defineCollection({
    type: 'data',
    schema: z.object({
      id:          z.string(),
      title:       z.string(),
      slug:        z.string(),
      lang:        z.string(),
      lang_label:  z.string(),
      ext:         z.string(),
      renderable:  z.boolean(),
      char_len:    z.number(),
      line_count:  z.number(),
      tags:        z.array(z.string()),
      conv_id:     z.string(),
      conv_title:  z.string(),
      created_at:  z.string().nullable(),
      source:      z.enum(['antArtifact', 'fenced']),
    })
  })
}
```

Place `.meta.json` files in `src/content/artifacts/`.

Static routes at `src/pages/vault/[slug].astro`:
```astro
---
import { getCollection } from 'astro:content'

export async function getStaticPaths() {
  const arts = await getCollection('artifacts')
  return arts.map(a => ({ params: { slug: a.data.slug }, props: { artifact: a } }))
}

const { artifact } = Astro.props
---
```

