/**
 * src/pages/api/graph.json.ts
 * Full graph data: nodes + edges combined for Graphify / D3 / Sigma.
 * GET /api/graph.json
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async () => {
  const [nodes, edges] = await Promise.all([
    getCollection('graphNodes'),
    getCollection('graphEdges'),
  ]);

  const graph = {
    generated_at: new Date().toISOString(),
    nodes: nodes.map(n => n.data),
    edges: edges.map(e => e.data),
  };

  return new Response(JSON.stringify(graph, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
