// Browser-side helper for calling the API through this site's /api/v1 proxy.

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; retryAfterSeconds?: number };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json?.data as T };
    return {
      ok: false,
      status: res.status,
      message: json?.error?.message ?? "Something went wrong. Please try again.",
      retryAfterSeconds: json?.error?.details?.retryAfterSeconds,
    };
  } catch (error) {
    console.error(error);
    return { ok: false, status: 0, message: "Can't reach Wearistry. Check your connection and try again." };
  }
}
