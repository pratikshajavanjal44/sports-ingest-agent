markdown
# AI-Assisted Development Log

I used Claude (Anthropic) as a coding assistant throughout this project —
directing the architecture, making the technical decisions below, and
debugging issues as they came up. This log documents where and how.

## Architecture decisions (mine)

- Chose a sports-domain chat agent to align with my ESPN platform background.
- Mapped the four required components to specific Cloudflare products:
  Workers AI (Llama 3.3) for the LLM, Workflows for orchestration, Durable
  Objects for per-session memory, Pages for the chat UI.
- Decided to have the Workflow orchestrate a context-fetch step before the
  LLM call, rather than calling the LLM directly, so the agent grounds
  answers in real data when available.

## Session 1 — Scaffolding

Prompted Claude to scaffold the initial project structure (Worker,
`ChatSession` Durable Object, `SportsInsightsWorkflow` Workflow, Pages UI)
based on the architecture above. Reviewed the generated `wrangler.toml`
bindings and file structure before proceeding.

## Session 2 — Deployment & debugging

Deployed and debugged the project myself, using Claude to help diagnose
issues as they came up:

1. Created the Worker and Durable Object bindings in the Cloudflare
   dashboard.
2. Hit a git mistake — committed from the wrong directory, which pushed the
   project zip instead of its contents, with the wrong (work) email as
   commit author. Diagnosed and fixed by re-extracting files, amending the
   commit author, and force-pushing corrected history.
3. Installed Node.js/npm (missing initially) and authenticated Wrangler.
4. Testing locally, I caught that team lookups were pulling the wrong sport
   entirely (a college hockey team instead of the NBA team I asked about).
   Traced this to a naive regex extraction and had Claude implement a fix:
   an LLM-based `extract-team-name` Workflow step run before the data
   lookup, turning the Workflow into a 3-step pipeline.
5. Deployed to production, then hit a second real bug: the Cloudflare Pages
   dashboard's drag-and-drop upload reported success twice but served 404s
   live. Diagnosed this as a dashboard-specific issue (not my file) by
   testing with curl, and worked around it by deploying via
   `npx wrangler pages deploy public --project-name=sportagent` from the
   CLI, which succeeded immediately.
6. Verified the full production stack end-to-end via a live chat test.

## Session 3 — Finalizing for submission

Added live demo links to the README and finalized this log.