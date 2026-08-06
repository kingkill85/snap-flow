export const LOOPBACK_COMMENT_MARKER = "<!-- snapflow:neo-webhook -->";

export interface WebhookHandoffConfig {
  secret: string;
  repository: string;
}

export interface WebhookQueueRecord {
  deliveryId: string;
  event: "issues" | "issue_comment";
  action: string;
  repository: string;
  issueNumber: number;
  commentId: number | null;
  profile: "dev";
  receivedAt: string;
  payloadVersion: 1;
}

export interface WebhookHandoffStore {
  accept(record: WebhookQueueRecord): "accepted" | "duplicate";
}

interface GitHubPayload {
  action?: unknown;
  repository?: { full_name?: unknown };
  issue?: {
    number?: unknown;
    state?: unknown;
    labels?: Array<{ name?: unknown }>;
  };
  comment?: { id?: unknown; body?: unknown };
}

const encoder = new TextEncoder();

function json(status: number, body: Record<string, string>): Response {
  return Response.json(body, { status });
}

function decodeSignature(value: string | null): {
  bytes: Uint8Array;
  isWellFormed: boolean;
} {
  const result = new Uint8Array(32);
  if (!value?.startsWith("sha256=") || value.length !== 71) {
    return { bytes: result, isWellFormed: false };
  }
  const hex = value.slice(7);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    return { bytes: result, isWellFormed: false };
  }
  for (let index = 0; index < result.length; index++) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return { bytes: result, isWellFormed: true };
}

async function hasValidSignature(
  rawBody: Uint8Array,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bodyBuffer = rawBody.slice().buffer as ArrayBuffer;
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, bodyBuffer),
  );
  const supplied = decodeSignature(signature);
  let difference = supplied.isWellFormed ? 0 : 1;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected[index] ^ supplied.bytes[index];
  }
  return difference === 0;
}

export async function handleGitHubWebhook(
  request: Request,
  config: WebhookHandoffConfig,
  store: WebhookHandoffStore,
): Promise<Response> {
  if (!config.secret || !config.repository) {
    return json(500, { error: "invalid_configuration" });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (
    !await hasValidSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      config.secret,
    )
  ) {
    return json(401, { error: "invalid_signature" });
  }

  let payload: GitHubPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as GitHubPayload;
  } catch {
    return json(400, { error: "invalid_payload" });
  }

  if (payload.repository?.full_name !== config.repository) {
    return json(403, { error: "wrong_repository" });
  }

  const event = request.headers.get("x-github-event");
  const deliveryId = request.headers.get("x-github-delivery");
  const action = payload.action;
  const issueNumber = payload.issue?.number;
  if (typeof deliveryId !== "string" || deliveryId.length === 0) {
    return json(400, { error: "invalid_delivery" });
  }
  if (
    (event !== "issues" && event !== "issue_comment") ||
    typeof action !== "string" ||
    typeof issueNumber !== "number"
  ) {
    return json(202, { status: "ignored" });
  }

  const allowedIssueActions = new Set([
    "opened",
    "reopened",
    "edited",
    "labeled",
  ]);
  const hasNeoDevLabel =
    payload.issue?.labels?.some((label) => label.name === "neo-dev") === true;
  const eligibleIssue = payload.issue?.state === "open" && hasNeoDevLabel;
  const commentBody = payload.comment?.body;
  const eligibleAction = event === "issues"
    ? allowedIssueActions.has(action)
    : action === "created" &&
      typeof payload.comment?.id === "number" &&
      typeof commentBody === "string" &&
      !commentBody.includes(LOOPBACK_COMMENT_MARKER);
  if (!eligibleIssue || !eligibleAction) {
    return json(202, { status: "ignored" });
  }

  const record: WebhookQueueRecord = {
    deliveryId,
    event,
    action,
    repository: config.repository,
    issueNumber,
    commentId: typeof payload.comment?.id === "number"
      ? payload.comment.id
      : null,
    profile: "dev",
    receivedAt: new Date().toISOString(),
    payloadVersion: 1,
  };
  try {
    const status = store.accept(record);
    return json(status === "accepted" ? 202 : 200, { status });
  } catch {
    return json(503, { error: "handoff_unavailable" });
  }
}
