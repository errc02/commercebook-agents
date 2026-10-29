/**
 * SPEC-47: one MCP request over Streamable HTTP with Web Standard Request and Response, stateless (a server and a
 * transport per request, JSON answers, no session id). The remote server at https://commercebook.ai/mcp
 * (netlify/functions/mcp.ts) calls this with a client whose key is the request's Authorization: Bearer, never the
 * environment, and with the tool list scoped to the key's member kind (or the keyless tools when there is no key).
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { ClientConfig } from './client.js';
import { buildServer, type BuildOptions } from './server.js';

export async function handleMcpRequest(req: Request, config: ClientConfig, options: BuildOptions, parsedBody?: unknown): Promise<Response> {
  const server = buildServer(config, options);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req, parsedBody === undefined ? undefined : { parsedBody });
  } finally {
    void transport.close();
    void server.close();
  }
}
