import { Env, ChatMessage, WorkflowResult } from "./types";

const MAX_HISTORY = 20;
const WORKFLOW_POLL_INTERVAL_MS = 500;
const WORKFLOW_TIMEOUT_MS = 20000;

export class ChatSession {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/chat" && request.method === "POST") {
      const { message } = (await request.json()) as { message: string };

      // Load persisted conversation memory for this session.
      const history: ChatMessage[] =
        (await this.state.storage.get("history")) ?? [];

      history.push({ role: "user", content: message });

      // Kick off the durable Workflow: fetch sports context, then call the LLM.
      const instance = await this.env.SPORTS_WORKFLOW.create({
        params: { message, history },
      });

      const result = await this.waitForWorkflow(instance.id);

      history.push({ role: "assistant", content: result.reply });

      // Trim and persist memory.
      const trimmed = history.slice(-MAX_HISTORY);
      await this.state.storage.put("history", trimmed);

      return new Response(
        JSON.stringify({
          reply: result.reply,
          contextUsed: result.contextUsed,
          history: trimmed,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.pathname === "/history" && request.method === "GET") {
      const history = (await this.state.storage.get("history")) ?? [];
      return new Response(JSON.stringify({ history }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  /**
   * Polls the Workflow instance until it completes, errors, or times out.
   * Cloudflare Workflows run durably in the background; this loop bridges
   * that async execution back into a synchronous chat response.
   */
  private async waitForWorkflow(instanceId: string): Promise<WorkflowResult> {
    const deadline = Date.now() + WORKFLOW_TIMEOUT_MS;
    const instance = await this.env.SPORTS_WORKFLOW.get(instanceId);

    while (Date.now() < deadline) {
      const status = await instance.status();

      if (status.status === "complete") {
        return status.output as WorkflowResult;
      }
      if (status.status === "errored" || status.status === "terminated") {
        return {
          reply:
            "Sorry, I ran into an issue pulling that together. Could you try rephrasing?",
          contextUsed: "",
        };
      }
      await new Promise((r) => setTimeout(r, WORKFLOW_POLL_INTERVAL_MS));
    }

    return {
      reply: "That took longer than expected — please try again.",
      contextUsed: "",
    };
  }
}
