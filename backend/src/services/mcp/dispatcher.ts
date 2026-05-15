import type { Hono } from 'hono';

export interface DispatchInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  accessToken: string;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  // deno-lint-ignore no-explicit-any
  body: any;
}

/**
 * Dispatch a request to the in-process Hono app using the user's access token.
 *
 * MCP tools call this instead of touching repositories directly, so that all
 * middleware (auth, tenant scoping, Zod validation, role checks, cascading
 * business logic) runs exactly as it would for a real HTTP request from the
 * frontend.
 */
export async function dispatchToBackend(
  app: Hono,
  input: DispatchInput,
): Promise<DispatchResult> {
  const url = new URL(`http://internal${input.path}`);
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const init: RequestInit = {
    method: input.method,
    headers: { Authorization: `Bearer ${input.accessToken}` },
  };
  if (input.body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(input.body);
  }

  const res = await app.fetch(new Request(url, init));
  const contentType = res.headers.get('content-type') ?? '';
  // deno-lint-ignore no-explicit-any
  let body: any = null;
  if (contentType.startsWith('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { ok: res.ok, status: res.status, body };
}
