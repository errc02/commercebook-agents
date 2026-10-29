#!/usr/bin/env node
/**
 * The stdio transport: what Claude Desktop, Claude Code and OpenClaw-style agents launch. The environment carries
 * COMMERCEBOOK_API_KEY (the key from Settings > Agent access) and, optionally, COMMERCEBOOK_BASE (default
 * https://commercebook.ai). SPEC-74: without a key the server starts with the keyless tools (the market, the open
 * requests, the network numbers, the buyer briefing, feedback and sign-up), as the remote server does at
 * https://commercebook.ai/mcp. SPEC-84: the tools are grouped by task; COMMERCEBOOK_ROLE picks a role's list. Nothing is written to stdout but the protocol; the key is never printed.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './server.js';
import { setConnectionRole } from './intent-surface.js';

async function main(): Promise<void> {
  const key = (process.env.COMMERCEBOOK_API_KEY ?? '').trim();
  const base = (process.env.COMMERCEBOOK_BASE ?? 'https://commercebook.ai').trim().replace(/\/+$/, '');
  // SPEC-84: COMMERCEBOOK_ROLE (buyer, seller, warehouse or all) names the tools tools/list answers; so does
  // clientInfo.role (or _meta.role) on initialize, and the role argument of tools/list itself.
  const role = (process.env.COMMERCEBOOK_ROLE ?? '').trim() || null;
  const server = key ? buildServer(undefined, { role }) : buildServer({ base, key: '' }, { keyless: true, role });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const handle = transport.onmessage;
  transport.onmessage = (message) => {
    const m = message as { method?: string; params?: { clientInfo?: { role?: unknown }; _meta?: { role?: unknown } } };
    if (m.method === 'initialize') setConnectionRole(server, m.params?.clientInfo?.role ?? m.params?._meta?.role);
    handle?.(message);
  };
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
