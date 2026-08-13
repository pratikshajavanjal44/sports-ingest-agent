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

    // Step 1: use the LLM to extract the team name being asked about, so
    // lookups aren't fooled by ambiguous team names (e.g. "Lakers" could be
    // NBA or NCAA hockey). Returns "NONE" if no team is mentioned.
    const teamName = await step.do(
      "extract-team-name",
      {
        retries: { limit: 2, delay: "1 second", backoff: "exponential" },
        timeout: "10 seconds",
      },
      async () => {
        return await extractTeamName(this.env, message);
      }
    );

    // Step 2: pull light sports context from a free public API (TheSportsDB
    // test key) using the extracted team name.
    const contextUsed = await step.do(
      "fetch-sports-context",
      {
        retries: { limit: 2, delay: "1 second", backoff: "exponential" },
        timeout: "10 seconds",
      },
      async () => {
        return await fetchSportsContext(teamName);
      }
    );

    // Step 3: call the LLM with conversation history + fetched context.
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

async function extractTeamName(env: Env, message: string): Promise<string> {
  try {
    const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content:
            "Extract the single sports team the user is asking about. " +
            "Respond with ONLY the full team name including city/region if " +
            "mentioned (e.g. 'Los Angeles Lakers', 'Manchester United'), " +
            "or respond with exactly NONE if no specific team is mentioned. " +
            "No punctuation, no explanation, just the name or NONE.",
        },
        { role: "user", content: message },
      ],
    });
    const text = (result as { response?: string }).response?.trim() || "NONE";
    return text.replace(/["'.]/g, "");
  } catch {
    return "NONE";
  }
}

async function fetchSportsContext(teamName: string): Promise<string> {
  if (!teamName || teamName.toUpperCase() === "NONE") return "";

  try {
    const res = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(
        teamName
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
