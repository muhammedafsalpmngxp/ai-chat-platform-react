import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";

import { DEFAULT_SYSTEM_PROMPT, type Provider } from "../src/lib/providers";

/** Per-request settings, passed to the graph through `config.configurable`. */
export interface ChatConfigurable {
  provider: Provider;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}

// Server-side refusal fallback is available on these Claude models.
const ANTHROPIC_FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-fable-5-2",
]);

function createModel({ provider, apiKey, model }: ChatConfigurable): BaseChatModel {
  if (provider === "anthropic") {
    const useFallback = ANTHROPIC_FALLBACK_MODELS.has(model);
    return new ChatAnthropic({
      apiKey,
      model,
      streaming: true,
      // If a safety classifier declines, let the API retry on a fallback model.
      ...(useFallback && {
        betas: ["server-side-fallback-2026-07-01"],
        invocationKwargs: { fallbacks: "default" },
      }),
    });
  }
  return new ChatOpenAI({ apiKey, model, streaming: true });
}

/** The single LLM node: prepend the system prompt and call the chosen model. */
async function callModel(state: typeof MessagesAnnotation.State, config: RunnableConfig) {
  const settings = config.configurable as ChatConfigurable;
  const llm = createModel(settings);
  const system = new SystemMessage(settings.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT);
  const response = await llm.invoke([system, ...state.messages], config);
  return { messages: [response] };
}

/**
 * Chat AI graph:  START -> chat -> END
 *
 * Kept as a LangGraph StateGraph so more nodes (tools, retrieval, routing,
 * memory) can be added later without changing the API route.
 */
export const chatGraph = new StateGraph(MessagesAnnotation)
  .addNode("chat", callModel)
  .addEdge(START, "chat")
  .addEdge("chat", END)
  .compile();
