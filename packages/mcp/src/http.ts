/**
 * The streamable HTTP transport, stateless: one server and transport per request, for agents that connect over HTTP.
 * Run `node dist/http.js` with COMMERCEBOOK_API_KEY in the environment (PORT, default 8787; HOST, default
 * 127.0.0.1). POST /mcp carries the protocol; GET /healthz answers ok. The key is read from the environment, never
 * from the request, so the listener must stay private to the agent's own host.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './server.js';
import { configFromEnv } from './client.js';

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

export function startHttp(port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? '127.0.0.1') {
  const config = configFromEnv();
  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not_found"}');
      return;
    }
    try {
      const server = buildServer(config);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      const body = req.method === 'POST' ? await readJson(req) : undefined;
      await transport.handleRequest(req, res, body);
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'server_error', detail: e instanceof Error ? e.message : String(e) }));
    }
  });
  http.listen(port, host, () => console.error(`commercebook-mcp http on http://${host}:${port}/mcp`));
  return http;
}

if (process.argv[1] && /http\.js$/.test(process.argv[1])) startHttp();
