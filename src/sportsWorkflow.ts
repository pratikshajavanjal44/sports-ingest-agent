import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { Env, WorkflowParams, WorkflowResult, ChatMessage } from "./types";

const SYSTEM_PROMPT = `You are a knowledgeable, concise sports assistant.
Use the supplied team/context data when relevant. If no context was found,
answer from general sports knowledge and say so if you're unsure.
Keep answers conversational and under 150 words unless asked for detail.`;

export class SportsInsightsWorkflow extends WorkflowEntrypoint<
  Env,
  WorkflowParams
> {
  async run(
    event: WorkflowEvent<WorkflowParams>,
    step: WorkflowStep
  ): Promise<WorkflowResult> {
    const { message, history } = event.payload;

    // Step 1: pull light sports context from a free public API (TheSportsDB
    // test key) if the message looks like it references a team.
    const contextUsed = await step.do(
      "fetch-sports-context",
      {
        retries: { limit: 2, delay: "1 second", backoff: "exponential" },
        timeout: "10 seconds",
      },
      async () => {
        return await fetchSportsContext(message);
      }
    );

    // Step 2: call the LLM with conversation history + fetched context.
    const reply = await step.do(
      "generate-response",
      {
        retries: { limit: 2, delay: "1 second", backoff: "exponential" },
        timeout: "20 seconds",
      },
      async () => {
        return await generateReply(this.env, message, history, contextUsed);
      }
    );

    return { reply, contextUsed };
  }
}

async function fetchSportsContext(message: string): Promise<string> {
  const guess = extractTeamGuess(message);
  if (!guess) return "";

  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(
        guess
      )}`
    );
    if (!res.ok) return "";

    const data = (await res.json()) as { teams?: any[] };
    const team = data.teams?.[0];
    if (!team) return "";

    return [
      `Team: ${team.strTeam}`,
      team.strLeague ? `League: ${team.strLeague}` : "",
      team.strStadium ? `Stadium: ${team.strStadium}` : "",
      team.strDescriptionEN
        ? `About: ${String(team.strDescriptionEN).slice(0, 400)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}

function extractTeamGuess(message: string): string | null {
  // Naive heuristic: use the longest capitalized word sequence as a team
  // name guess. Good enough as a starting point — swap for a real NER /
  // entity-extraction step or a sports data provider as you extend this.
  const matches = message.match(/\b([A-Z][a-zA-Z.]*\s?){1,3}\b/g);
  if (!matches) return null;
  const best = matches.sort((a, b) => b.length - a.length)[0];
  return best?.trim() || null;
}

async function generateReply(
  env: Env,
  message: string,
  history: ChatMessage[],
  contextUsed: string
): Promise<string> {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
  ];

  if (contextUsed) {
    messages.push({
      role: "system",
      content: `Relevant sports data:\n${contextUsed}`,
    });
  }

  messages.push({ role: "user", content: message });

  const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
    messages,
  });

  // Workers AI text-generation models return { response: string }.
  return (result as { response?: string }).response?.trim() || "…";
}
