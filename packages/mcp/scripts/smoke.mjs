// Smoke: starts the built stdio server, lists its tools and calls commercebook_start action whoami against the API in
// COMMERCEBOOK_BASE with COMMERCEBOOK_API_KEY. Prints one JSON line: {tools, whoami} or {error}. Never the key.
//   COMMERCEBOOK_API_KEY=... COMMERCEBOOK_BASE=http://127.0.0.1:4195/.netlify/functions/api node scripts/smoke.mjs
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const client = new Client({ name: 'commercebook-smoke', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [`${PKG}dist/stdio.js`],
  env: { ...process.env },
  stderr: 'pipe',
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const r = await client.callTool({ name: 'commercebook_start', arguments: { action: 'whoami' } });
  const text = r.content?.find((c) => c.type === 'text')?.text ?? '{}';
  const whoami = JSON.parse(text);
  if (whoami.key_prefix) whoami.key_prefix = `${String(whoami.key_prefix).slice(0, 9)}...`;
  console.log(JSON.stringify({ tools: tools.map((t) => t.name), isError: r.isError ?? false, whoami }));
  await client.close();
  process.exit(r.isError ? 2 : 0);
} catch (e) {
  console.log(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
}
