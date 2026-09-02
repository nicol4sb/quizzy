const visitorStorageKey = "quizzy:analytics-visitor";

function visitorId(): string | undefined {
  try {
    const existing = window.localStorage.getItem(visitorStorageKey);
    if (existing) return existing;
    const created =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(visitorStorageKey, created);
    return created;
  } catch {
    return undefined;
  }
}

export function trackAnalytics(
  eventType: string,
  details: {
    path?: string;
    quizId?: string;
    liveSessionId?: string;
    metadata?: Record<string, unknown>;
  } = {},
): void {
  const body = JSON.stringify({
    eventType,
    visitorId: visitorId(),
    path: details.path ?? window.location.pathname,
    quizId: details.quizId,
    liveSessionId: details.liveSessionId,
    metadata: details.metadata,
  });
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
