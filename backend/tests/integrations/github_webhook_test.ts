import { assertEquals } from "@std/assert";
import {
  handleGitHubWebhook,
  type WebhookHandoffConfig,
  type WebhookHandoffStore,
  type WebhookQueueRecord,
} from "../../src/integrations/github-webhook/handler.ts";
import { SqliteWebhookHandoffStore } from "../../src/integrations/github-webhook/sqlite-store.ts";

const encoder = new TextEncoder();

class MemoryStore implements WebhookHandoffStore {
  readonly records: WebhookQueueRecord[] = [];
  readonly deliveries = new Set<string>();

  accept(record: WebhookQueueRecord): "accepted" | "duplicate" {
    if (this.deliveries.has(record.deliveryId)) return "duplicate";
    this.deliveries.add(record.deliveryId);
    this.records.push(record);
    return "accepted";
  }
}

const config: WebhookHandoffConfig = {
  secret: "test-secret",
  repository: "acme/snap-flow",
};

function issuePayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "opened",
    repository: { full_name: "acme/snap-flow" },
    issue: {
      number: 77,
      state: "open",
      labels: [{ name: "neo-dev" }],
    },
    ...overrides,
  };
}

async function sign(body: string, secret = config.secret): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );
  return `sha256=${
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }`;
}

async function request(
  payload: unknown,
  headers: Record<string, string> = {},
  secret = config.secret,
): Promise<Request> {
  const body = JSON.stringify(payload);
  return new Request("http://127.0.0.1/webhook", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-github-event": "issues",
      "x-github-delivery": crypto.randomUUID(),
      "x-hub-signature-256": await sign(body, secret),
      ...headers,
    },
  });
}

Deno.test("webhook accepts a valid signed issues delivery for the exact repository", async () => {
  const store = new MemoryStore();
  const response = await handleGitHubWebhook(
    await request(issuePayload()),
    config,
    store,
  );

  assertEquals(response.status, 202);
  assertEquals(await response.json(), { status: "accepted" });
  assertEquals(store.records.length, 1);
});

Deno.test("webhook rejects invalid and missing signatures", async (t) => {
  for (
    const testCase of [
      { name: "invalid secret", headers: {}, secret: "wrong-secret" },
      { name: "missing", headers: { "x-hub-signature-256": "" } },
      { name: "malformed", headers: { "x-hub-signature-256": "sha256=xyz" } },
    ]
  ) {
    await t.step(testCase.name, async () => {
      const store = new MemoryStore();
      const response = await handleGitHubWebhook(
        await request(issuePayload(), testCase.headers, testCase.secret),
        config,
        store,
      );
      assertEquals(response.status, 401);
      assertEquals(store.records.length, 0);
    });
  }
});

Deno.test("webhook rejects a payload from a different repository", async () => {
  const store = new MemoryStore();
  const response = await handleGitHubWebhook(
    await request(issuePayload({ repository: { full_name: "acme/other" } })),
    config,
    store,
  );

  assertEquals(response.status, 403);
  assertEquals(store.records.length, 0);
});

Deno.test("webhook rejects a missing delivery identifier", async () => {
  const store = new MemoryStore();
  const response = await handleGitHubWebhook(
    await request(issuePayload(), { "x-github-delivery": "" }),
    config,
    store,
  );

  assertEquals(response.status, 400);
  assertEquals(await response.json(), { error: "invalid_delivery" });
  assertEquals(store.records.length, 0);
});

Deno.test("webhook ignores unsupported events and actions", async (t) => {
  for (
    const testCase of [
      {
        name: "unsupported event",
        headers: { "x-github-event": "push" },
        payload: issuePayload(),
      },
      {
        name: "unsupported issue action",
        headers: {},
        payload: issuePayload({ action: "closed" }),
      },
      {
        name: "unsupported comment action",
        headers: { "x-github-event": "issue_comment" },
        payload: issuePayload({
          action: "edited",
          comment: { id: 10, body: "please continue" },
        }),
      },
    ]
  ) {
    await t.step(testCase.name, async () => {
      const store = new MemoryStore();
      const response = await handleGitHubWebhook(
        await request(testCase.payload, testCase.headers),
        config,
        store,
      );
      assertEquals(response.status, 202);
      assertEquals(await response.json(), { status: "ignored" });
      assertEquals(store.records.length, 0);
    });
  }
});

Deno.test("webhook requires an open issue with the neo-dev label", async (t) => {
  for (
    const [name, testCase] of [
      [
        "missing label",
        issuePayload({ issue: { number: 77, state: "open", labels: [] } }),
      ],
      [
        "closed issue",
        issuePayload({
          issue: { number: 77, state: "closed", labels: [{ name: "neo-dev" }] },
        }),
      ],
      [
        "case mismatch",
        issuePayload({
          issue: { number: 77, state: "open", labels: [{ name: "Neo-Dev" }] },
        }),
      ],
    ]
  ) {
    await t.step(name as string, async () => {
      const store = new MemoryStore();
      const response = await handleGitHubWebhook(
        await request(testCase),
        config,
        store,
      );
      assertEquals(await response.json(), { status: "ignored" });
      assertEquals(store.records.length, 0);
    });
  }
});

Deno.test("webhook accepts only unmarked created issue comments", async (t) => {
  await t.step("accepts an eligible comment", async () => {
    const store = new MemoryStore();
    const response = await handleGitHubWebhook(
      await request(
        issuePayload({
          action: "created",
          comment: { id: 1001, body: "please continue" },
        }),
        { "x-github-event": "issue_comment" },
      ),
      config,
      store,
    );
    assertEquals(response.status, 202);
    assertEquals(store.records[0]?.commentId, 1001);
  });

  await t.step(
    "ignores a loopback marker anywhere in the comment",
    async () => {
      const store = new MemoryStore();
      const response = await handleGitHubWebhook(
        await request(
          issuePayload({
            action: "created",
            comment: {
              id: 1002,
              body: `automated response\n${"<!-- snapflow:neo-webhook -->"}`,
            },
          }),
          { "x-github-event": "issue_comment" },
        ),
        config,
        store,
      );
      assertEquals(await response.json(), { status: "ignored" });
      assertEquals(store.records.length, 0);
    },
  );
});

Deno.test("webhook deduplicates a delivery without adding another queue record", async () => {
  const store = new MemoryStore();
  const deliveryId = "delivery-repeat";
  const first = await handleGitHubWebhook(
    await request(issuePayload(), { "x-github-delivery": deliveryId }),
    config,
    store,
  );
  const second = await handleGitHubWebhook(
    await request(issuePayload(), { "x-github-delivery": deliveryId }),
    config,
    store,
  );

  assertEquals(first.status, 202);
  assertEquals(second.status, 200);
  assertEquals(await second.json(), { status: "duplicate" });
  assertEquals(store.records.length, 1);
});

Deno.test("sqlite store persists deduplication and a dev queue record across restart", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "snapflow-webhook-" });
  const databasePath = `${tempDir}/handoff.sqlite`;
  try {
    const deliveryId = "delivery-persistent";
    const firstStore = new SqliteWebhookHandoffStore(databasePath);
    const first = await handleGitHubWebhook(
      await request(issuePayload(), { "x-github-delivery": deliveryId }),
      config,
      firstStore,
    );
    assertEquals(first.status, 202);
    assertEquals(firstStore.listQueued(), [{
      deliveryId,
      event: "issues",
      action: "opened",
      repository: "acme/snap-flow",
      issueNumber: 77,
      commentId: null,
      profile: "dev",
      payloadVersion: 1,
      status: "queued",
    }]);
    firstStore.close();

    const restartedStore = new SqliteWebhookHandoffStore(databasePath);
    const replay = await handleGitHubWebhook(
      await request(issuePayload(), { "x-github-delivery": deliveryId }),
      config,
      restartedStore,
    );
    assertEquals(replay.status, 200);
    assertEquals(await replay.json(), { status: "duplicate" });
    assertEquals(restartedStore.listQueued().length, 1);
    restartedStore.close();
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
