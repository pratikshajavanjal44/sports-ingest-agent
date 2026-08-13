import { Env } from "./types";
import { ChatSession } from "./chatSession";
import { SportsInsightsWorkflow } from "./sportsWorkflow";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "sports-insights-agent",
          endpoints: ["POST /chat { sessionId, message }"],
        }),
        { headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
      );
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      let body: { sessionId?: string; message?: string };
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      const sessionId = body.sessionId || "default";
      const message = body.message?.trim();

      if (!message) {
        return new Response(JSON.stringify({ error: "message is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
      }

      // Route to the Durable Object instance for this session (memory/state).
      const id = env.CHAT_SESSION.idFromName(sessionId);
      const stub = env.CHAT_SESSION.get(id);

      const doResponse = await stub.fetch("https://internal/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const result = await doResponse.text();
      return new Response(result, {
        status: doResponse.status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};

// Durable Object and Workflow classes must be exported from the entrypoint
// module so wrangler can register them per wrangler.toml bindings.
export { ChatSession, SportsInsightsWorkflow };
