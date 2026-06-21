/**
 * src/pages/api/artifact/[slug].json.ts
 * Per-artifact JSON endpoint.
 * GET /api/artifact/<slug>.json
 */
import type { APIRoute, GetStaticPaths } from 'astro';
import { getAllArtifacts }               from '@lib/artifacts';
import type { ArtifactEntry }            from '@lib/types';

export const getStaticPaths: GetStaticPaths = async () => {
  const all = await getAllArtifacts();
  return all.map(entry => ({
    params: { slug: entry.data.slug },
    props:  { entry },
  }));
};

interface Props { entry: ArtifactEntry }

export const GET: APIRoute = ({ props }) => {
  const { entry } = props as Props;
  const { data }  = entry;

  return new Response(JSON.stringify({
    id:         data.id,
    title:      data.title,
    slug:       data.slug,
    lang:       data.lang,
    lang_label: data.lang_label,
    ext:        data.ext,
    renderable: data.renderable,
    source:     data.source,
    char_len:   data.char_len,
    line_count: data.line_count,
    tags:       data.tags,
    conv_id:    data.conv_id,
    conv_title: data.conv_title,
    created_at: data.created_at,
    href:       `/vault/${data.slug}/`,
    raw_href:   `/artifacts/${data.lang}/${data.slug}.${data.ext}`,
  }, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
