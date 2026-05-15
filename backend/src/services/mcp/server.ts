import type { Hono } from 'hono';
import { listProjectsTool } from './tools/list-projects.ts';
import { getProjectTool } from './tools/get-project.ts';
import { getProjectTotalTool } from './tools/get-project-total.ts';
import { searchItemsTool } from './tools/search-items.ts';

const allTools = [listProjectsTool, getProjectTool, getProjectTotalTool, searchItemsTool];

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * Minimal MCP server: handles `initialize`, `tools/list`, `tools/call` over JSON-RPC.
 * Tools dispatch back through the same Hono app (Pattern B) so every middleware runs.
 */
export async function handleMcpRequest(
  app: Hono,
  accessToken: string,
  req: JsonRpcRequest,
): Promise<unknown> {
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'snapflow-mcp', version: '0.1.0' },
      },
    };
  }
  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: allTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: 'object' },
        })),
      },
    };
  }
  if (req.method === 'tools/call') {
    const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
    if (!params) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'missing params' } };
    }
    const tool = allTools.find((t) => t.name === params.name);
    if (!tool) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `unknown tool: ${params.name}` } };
    }
    const parsed = tool.inputSchema.safeParse(params.arguments ?? {});
    if (!parsed.success) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: parsed.error.message } };
    }
    // deno-lint-ignore no-explicit-any
    const result = await (tool.handler as any)(parsed.data, { app, accessToken });
    return { jsonrpc: '2.0', id: req.id, result };
  }
  return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `unknown method: ${req.method}` } };
}
