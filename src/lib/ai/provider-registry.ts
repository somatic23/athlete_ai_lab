import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { db } from "@/db";
import { aiProviders } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type ProviderRow = typeof aiProviders.$inferSelect;

function buildModel(row: ProviderRow): LanguageModel {
  const { provider, apiKey, baseUrl, modelId } = row;

  switch (provider) {
    case "openai":
      // Use .chat() to force Chat Completions API; the SDK default (Responses API)
      // injects item_reference blocks that break multi-turn conversations.
      return createOpenAI({
        apiKey: apiKey ?? undefined,
        baseURL: baseUrl ?? undefined,
      }).chat(modelId);

    case "anthropic":
      return createAnthropic({ apiKey: apiKey ?? undefined })(modelId);

    case "gemini":
      return createGoogleGenerativeAI({ apiKey: apiKey ?? undefined })(modelId);

    case "openrouter":
      // OpenRouter only supports Chat Completions, not the Responses API.
      return createOpenAI({
        apiKey: apiKey ?? undefined,
        baseURL: baseUrl || "https://openrouter.ai/api/v1",
      }).chat(modelId);

    case "ollama": {
      const ollamaBase = (baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
      const ollamaUrl = ollamaBase.endsWith("/v1") ? ollamaBase : `${ollamaBase}/v1`;
      // Ollama only supports Chat Completions, not the Responses API.
      return createOpenAI({
        apiKey: "ollama",
        baseURL: ollamaUrl,
      }).chat(modelId);
    }

    default:
      throw new Error(`Unknown provider type: ${provider}`);
  }
}

/** Returns a LanguageModel from the default active provider, or the first active one. */
export async function getDefaultModel(): Promise<LanguageModel> {
  // Try default first
  const defaultProvider = await db.query.aiProviders.findFirst({
    where: and(eq(aiProviders.isDefault, true), eq(aiProviders.isActive, true)),
  });
  if (defaultProvider) return buildModel(defaultProvider);

  // Fall back to any active provider
  const anyActive = await db.query.aiProviders.findFirst({
    where: eq(aiProviders.isActive, true),
  });
  if (anyActive) return buildModel(anyActive);

  throw new Error(
    "Kein AI-Provider konfiguriert. Bitte einen Provider im Admin-Panel aktivieren."
  );
}
