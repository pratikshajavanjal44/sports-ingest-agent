export interface Env {
  AI: Ai;
  CHAT_SESSION: DurableObjectNamespace;
  SPORTS_WORKFLOW: Workflow;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorkflowParams {
  message: string;
  history: ChatMessage[];
}

export interface WorkflowResult {
  reply: string;
  contextUsed: string;
}
