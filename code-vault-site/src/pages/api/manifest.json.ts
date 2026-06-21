/**
 * src/pages/api/manifest.json.ts
 * Static JSON endpoint — full manifest with stats.
 * GET /api/manifest.json
 */
import type { APIRoute } from 'astro';
import { getVaultStats, getAllArtifacts } from '@lib/artifacts';

export const GET: APIRoute = async () => {
  const [stats, all] = await Promise.all([getVaultStats(), getAllArtifacts()]);

  const manifest = {
    generated_at:        new Date().toISOString(),
    total_artifacts:     stats.total,
    renderable_count:    stats.renderable,
    total_conversations: stats.conversations,
    total_chars:         stats.totalChars,
    languages:           stats.languages,
    by_lang:             stats.byLang,
    top_tags:            stats.topTags,
    artifacts:           all.map(e => ({
      id:         e.data.id,
      title:      e.data.title,
      slug:       e.data.slug,
      lang:       e.data.lang,
      lang_label: e.data.lang_label,
      ext:        e.data.ext,
      renderable: e.data.renderable,
      source:     e.data.source,
      char_len:   e.data.char_len,
      line_count: e.data.line_count,
      tags:       e.data.tags,
      conv_id:    e.data.conv_id,
      conv_title: e.data.conv_title,
      created_at: e.data.created_at,
      href:       `/vault/${e.data.slug}/`,
      raw_href:   `/artifacts/${e.data.lang}/${e.data.slug}.${e.data.ext}`,
    })),
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
