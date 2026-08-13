# Sports Insights Agent

An AI-powered chat agent built on Cloudflare's developer platform. Ask it about
a sports team and it fetches live context, reasons over it with an LLM, and
remembers the conversation.

## Architecture

| Requirement | Cloudflare product | Where |
|---|---|---|
| LLM | Workers AI — Llama 3.3 70B | `src/sportsWorkflow.ts` (`generateReply`) |
| Workflow / coordination | Workflows | `src/sportsWorkflow.ts` (`SportsInsightsWorkflow`) |
| User input (chat) | Pages (static UI) → Worker | `public/index.html`, `src/index.ts` |
| Memory / state | Durable Objects | `src/chatSession.ts` (`ChatSession`) |

**Request flow:**

1. The Pages UI (`public/index.html`) sends `POST /chat` to the Worker with a
   `sessionId` and `message`.
2. The Worker (`src/index.ts`) routes the request to a `ChatSession` Durable
   Object instance keyed by `sessionId` — this is where conversation memory
   lives across turns.
3. The Durable Object triggers a `SportsInsightsWorkflow` run, which executes
   two durable, retryable steps:
   - `fetch-sports-context` — looks up team info from a public sports API
   - `generate-response` — calls Llama 3.3 via Workers AI with the
     conversation history + fetched context
4. The Durable Object polls the Workflow instance until it completes, saves
   the updated history, and returns the reply to the UI.

## Setup

```bash
npm install
npx wrangler login
npm run dev      # local development at http://localhost:8787
npm run deploy   # deploy to your Cloudflare account
```

After deploying, open `public/index.html` (or deploy it separately to
Cloudflare Pages) and paste in your Worker's URL, e.g.
`https://sports-ingest-agent.<your-subdomain>.workers.dev`.

## Notes / next steps

- Team-name extraction in `extractTeamGuess()` is a naive heuristic — a real
  version would use a proper NER step or a structured sports data provider.
- `MAX_HISTORY` caps stored turns per session to keep Durable Object storage
  small; raise it if you want longer memory.
- See `PROMPTS.md` for the AI-assisted development log.
