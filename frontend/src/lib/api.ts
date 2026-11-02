// Browser-side helper for calling the API through this site's /api/v1 proxy.

type Meta = { nextCursor: string | null; limit: number };

export type ApiResult<T> =
  | { ok: true; data: T; meta?: Meta }
  | { ok: false; status: number; message: string; retryAfterSeconds?: number };

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json?.data as T, meta: json?.meta };
    return {
      ok: false,
      status: res.status,
      message: describeError(json?.error),
      retryAfterSeconds: json?.error?.details?.retryAfterSeconds,
    };
  } catch (error) {
    console.error(error);
    return { ok: false, status: 0, message: "Can't reach Wearistry. Check your connection and try again." };
  }
}

/** Prefers the specific field messages from a validation error ("Original price can't be lower…"). */
function describeError(error: { message?: string; details?: unknown } | undefined): string {
  if (Array.isArray(error?.details)) {
    const messages = error.details.flatMap((d: { message?: unknown }) => (typeof d?.message === "string" ? [d.message] : []));
    if (messages.length) return messages.join(" ");
  }
  return error?.message ?? "Something went wrong. Please try again.";
}
