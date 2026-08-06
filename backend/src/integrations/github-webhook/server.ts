import { handleGitHubWebhook } from "./handler.ts";
import { SqliteWebhookHandoffStore } from "./sqlite-store.ts";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const config = {
  secret: requiredEnvironment("SNAPFLOW_GITHUB_WEBHOOK_SECRET"),
  repository: requiredEnvironment("SNAPFLOW_GITHUB_REPOSITORY"),
};
const databasePath = requiredEnvironment("SNAPFLOW_GITHUB_WEBHOOK_DB");
const portValue = Deno.env.get("SNAPFLOW_GITHUB_WEBHOOK_PORT") ?? "8787";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    "SNAPFLOW_GITHUB_WEBHOOK_PORT must be an integer from 1 to 65535",
  );
}

const store = new SqliteWebhookHandoffStore(databasePath);

Deno.serve({ hostname: "127.0.0.1", port }, async (request) => {
  const url = new URL(request.url);
  if (url.pathname !== "/github-webhook") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, {
      status: 405,
      headers: { allow: "POST" },
    });
  }
  return await handleGitHubWebhook(request, config, store);
});
