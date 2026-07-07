// Neutral, provider-agnostic error reporting.
//
// Provider-agnostic error reporting. By default it just logs to
// the console. To wire up a real service (Sentry, PostHog, etc.), send `error`
// and `context` from inside `reportError`.

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[app error]", error, {
    route: window.location.pathname,
    ...context,
  });
}
