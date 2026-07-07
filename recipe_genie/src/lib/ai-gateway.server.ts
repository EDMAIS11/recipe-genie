import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Generic AI provider for the app.
 *
 * Talks to any
 * OpenAI-compatible endpoint, configured via environment variables:
 *
 *   AI_GATEWAY_URL  - base URL of the provider (defaults to Google Gemini's
 *                     OpenAI-compatible endpoint, which has a free tier)
 *   AI_API_KEY      - your provider API key
 *
 * Examples of compatible providers:
 *   - Google:      https://generativelanguage.googleapis.com/v1beta/openai/ (model: "gemini-2.5-flash")
 *   - OpenRouter:  https://openrouter.ai/api/v1   (model: "google/gemini-2.5-flash")
 *   - OpenAI:      https://api.openai.com/v1       (model: "gpt-4o-mini")
 *   - Groq:        https://api.groq.com/openai/v1
 *   - Together:    https://api.together.xyz/v1
 */
export function createAiProvider(apiKey: string) {
  const baseURL = process.env.AI_GATEWAY_URL || "https://generativelanguage.googleapis.com/v1beta/openai/";
  return createOpenAICompatible({
    name: "ai",
    baseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}
