/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Extend Window for dynamically loaded CDN globals
declare global {
  interface Window {
    duckdb:          typeof import('@duckdb/duckdb-wasm');
    graphology:      { Graph: new (opts?: Record<string, unknown>) => unknown };
    Sigma:           new (graph: unknown, container: HTMLElement, opts?: Record<string, unknown>) => unknown;
    graphologyLibrary?: Record<string, unknown>;
  }
}

export {};
