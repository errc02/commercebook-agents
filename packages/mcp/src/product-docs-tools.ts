/**
 * SPEC-103: a product's documents and published answers, one tool per operation of
 * netlify/functions/lib/openapi-product-docs.ts. A seller key (or the owner key of a seller). Registered once from
 * server.ts; the commercebook_seller_ prefix keeps them on a seller key's list (scope.ts). The intent tool
 * commercebook_seller_products runs them as the actions documents, document_add, document_remove, answers,
 * answer_upsert and answer_remove.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiClient, ApiError } from './client.js';

export const PRODUCT_DOCS_TOOL_NAMES = [
  'commercebook_seller_product_documents',
  'commercebook_seller_product_document_add',
  'commercebook_seller_product_document_remove',
  'commercebook_seller_product_answers',
  'commercebook_seller_product_answer_upsert',
  'commercebook_seller_product_answer_remove',
] as const;

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await fn(), null, 2) }] };
  } catch (e) {
    if (e instanceof ApiError) return { isError: true, content: [{ type: 'text', text: JSON.stringify(e.toResult()) }] };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'request_failed', detail: e instanceof Error ? e.message : String(e) }) }] };
  }
}

const id = z.string().uuid().describe('The product id, or the lot id of one of your products.');
const KINDS = ['spec_sheet', 'certificate', 'test_report', 'manual', 'safety_data', 'other'] as const;
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const enc = encodeURIComponent;

export function registerProductDocsTools(server: McpServer, api: ApiClient): void {
  server.registerTool('commercebook_seller_product_documents', {
    title: 'Documents of a product',
    description: 'GET /seller/products/{id}/documents: the documents of one of your products (spec sheets, certificates, test reports, manuals, safety data sheets), newest first, each with the address of its file. Public documents show on the fact sheet of every live lot of the product. Needs catalog read.',
    inputSchema: { id },
  }, async (args) => run(() => api.get(`/seller/products/${enc(args.id)}/documents`)));

  server.registerTool('commercebook_seller_product_document_add', {
    title: 'Add a document to a product',
    description: 'POST /seller/products/{id}/documents: adds a document. With url, CommerceBook fetches the file and stores it. Without url or storage_path, send mime: the answer is a signed upload address (POST /seller/products/{id}/documents/upload-url); PUT the file there, then call again with the storage_path it gave. A PDF, JPEG, PNG or WebP file, 20 MB at most; 20 documents per product. Needs catalog write.',
    inputSchema: {
      id,
      title: z.string().min(1).max(200).optional().describe('The name buyers see, such as "UL certificate 2026". Needed with url or storage_path.'),
      kind: z.enum(KINDS).optional().describe('What the document is; default other.'),
      url: z.string().url().optional().describe('The address of the file to fetch.'),
      storage_path: z.string().optional().describe('The storage_path the upload address answered, once the file is uploaded.'),
      mime: z.enum(MIMES).optional().describe('Without url or storage_path: the type of the file to upload, for the upload address.'),
      lot_id: z.string().uuid().optional().describe('Optional: the document is about this lot only.'),
      public: z.boolean().optional().describe('Default true: show it on the fact sheet.'),
    },
  }, async (args) => run(() => {
    const path = `/seller/products/${enc(args.id)}/documents`;
    if (!args.url && !args.storage_path) {
      if (!args.mime) throw new ApiError(400, 'invalid_input', 'url, storage_path or mime: send one', null);
      return api.post(`${path}/upload-url`, { mime: args.mime });
    }
    const body: Record<string, unknown> = { title: args.title ?? '', kind: args.kind ?? 'other' };
    if (args.url) body.url = args.url;
    if (args.storage_path) body.storage_path = args.storage_path;
    if (args.lot_id) body.lot_id = args.lot_id;
    if (args.public !== undefined) body.public = args.public;
    return api.post(path, body);
  }));

  server.registerTool('commercebook_seller_product_document_remove', {
    title: 'Remove a document from a product',
    description: 'DELETE /seller/products/{id}/documents/{document_id}: takes the document off the fact sheet. Needs catalog write.',
    inputSchema: { id, document_id: z.string().uuid().describe('The document, from the documents action.') },
  }, async (args) => run(() => api.del(`/seller/products/${enc(args.id)}/documents/${enc(args.document_id)}`)));

  server.registerTool('commercebook_seller_product_answers', {
    title: 'Answers of a product',
    description: 'GET /seller/products/{id}/answers: every question and answer of one of your products, published or not. Only published answers show on the fact sheet and in the market product read. Needs catalog read.',
    inputSchema: { id },
  }, async (args) => run(() => api.get(`/seller/products/${enc(args.id)}/answers`)));

  server.registerTool('commercebook_seller_product_answer_upsert', {
    title: 'Add, edit or publish an answer',
    description: 'POST /seller/products/{id}/answers (PATCH /seller/products/{id}/answers/{answer_id} with answer_id): adds a question and its answer, or changes one. public true shows it on the fact sheet; public alone with answer_id publishes or unpublishes it. Write the question in your own words; the buyer who asked is never named. source_thread_id ties the answer to one of your message threads. 50 answers per product. Needs catalog write.',
    inputSchema: {
      id,
      answer_id: z.string().uuid().optional().describe('Change this answer instead of adding one.'),
      question: z.string().min(1).max(500).optional().describe('The question, 500 characters at most. Needed to add.'),
      answer: z.string().min(1).max(2000).optional().describe('The answer, 2,000 characters at most. Needed to add.'),
      public: z.boolean().optional().describe('true: show it on the fact sheet. Default false when adding.'),
      source_thread_id: z.string().uuid().optional().describe('The message thread the question came from.'),
    },
  }, async (args) => run(() => {
    const { id: product, answer_id, ...rest } = args;
    const body = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    return answer_id ? api.patch(`/seller/products/${enc(product)}/answers/${enc(answer_id)}`, body) : api.post(`/seller/products/${enc(product)}/answers`, body);
  }));

  server.registerTool('commercebook_seller_product_answer_remove', {
    title: 'Remove an answer',
    description: 'DELETE /seller/products/{id}/answers/{answer_id}: removes the answer. Needs catalog write.',
    inputSchema: { id, answer_id: z.string().uuid().describe('The answer, from the answers action.') },
  }, async (args) => run(() => api.del(`/seller/products/${enc(args.id)}/answers/${enc(args.answer_id)}`)));
}
