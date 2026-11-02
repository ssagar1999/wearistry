"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { compressForUpload } from "@/lib/compress";

export const MAX_PHOTOS = 8;

type Item = { key: string; preview: string; status: "preparing" | "uploading" | "done" | "error"; progress: number; url?: string; error?: string };

function upload(blob: Blob, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/uploads");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      // A non-JSON body (e.g. a proxy error page) is treated like an error without a message.
      const body = (() => { try { return JSON.parse(xhr.responseText); } catch { return {}; } })();
      if (xhr.status === 201 && body.data?.url) resolve(body.data.url);
      else reject(new Error(body.error?.message ?? "Upload failed. Tap to retry."));
    };
    xhr.onerror = () => reject(new Error("Network problem. Tap to retry."));
    const form = new FormData();
    form.append("file", blob, "photo");
    xhr.send(form);
  });
}

/** Lets sellers add up to 8 photos; reports the uploaded URLs (cover first) and whether any are still uploading. */
export default function PhotoPicker({ onChange }: { onChange: (urls: string[], busy: boolean) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const files = useRef(new Map<string, File>());
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChange(items.filter((i) => i.url).map((i) => i.url!), items.some((i) => i.status === "preparing" || i.status === "uploading"));
  }, [items, onChange]);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function process(key: string) {
    const file = files.current.get(key)!;
    patch(key, { status: "preparing", progress: 0, error: undefined });
    const blob = await compressForUpload(file);
    patch(key, { status: "uploading" });
    try {
      const url = await upload(blob, (progress) => patch(key, { progress }));
      patch(key, { status: "done", url, progress: 1 });
    } catch (e) {
      patch(key, { status: "error", error: (e as Error).message });
    }
  }

  function add(list: FileList | null) {
    if (!list) return;
    const room = MAX_PHOTOS - items.length;
    const picked = [...list].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, room);
    const fresh = picked.map((f) => {
      const key = crypto.randomUUID();
      files.current.set(key, f);
      return { key, preview: URL.createObjectURL(f), status: "preparing" as const, progress: 0 };
    });
    setItems((xs) => [...xs, ...fresh]);
    fresh.forEach((x) => process(x.key));
    if (input.current) input.current.value = "";
  }

  function remove(key: string) {
    setItems((xs) => {
      const x = xs.find((i) => i.key === key);
      if (x) URL.revokeObjectURL(x.preview);
      return xs.filter((i) => i.key !== key);
    });
    files.current.delete(key);
  }

  const makeCover = (key: string) => setItems((xs) => [xs.find((x) => x.key === key)!, ...xs.filter((x) => x.key !== key)]);

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((x, i) => (
          <div key={x.key} className="relative aspect-[3/4] overflow-hidden rounded-lg bg-beige">
            <img src={x.preview} alt="" className={`h-full w-full object-cover ${x.status === "done" ? "" : "opacity-60"}`} />
            {i === 0 && <span className="label-tag absolute left-1.5 top-1.5 rounded-full bg-ink px-2 py-0.5 text-canvas">Cover</span>}
            <button type="button" onClick={() => remove(x.key)} aria-label="Remove photo"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-canvas text-base leading-none">×</button>
            {(x.status === "preparing" || x.status === "uploading") && (
              <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-canvas/70">
                <div className="h-full bg-forest transition-all" style={{ width: `${Math.max(8, x.progress * 100)}%` }} />
              </div>
            )}
            {x.status === "error" && (
              <button type="button" onClick={() => process(x.key)} className="absolute inset-x-1.5 bottom-1.5 rounded bg-terracotta px-1 py-1 text-[11px] font-semibold leading-tight text-white">
                {x.error} · Retry
              </button>
            )}
            {x.status === "done" && i > 0 && (
              <button type="button" onClick={() => makeCover(x.key)} className="absolute inset-x-1.5 bottom-1.5 rounded bg-canvas/90 py-1 text-[11px] font-semibold">
                Make cover
              </button>
            )}
          </div>
        ))}
        {items.length < MAX_PHOTOS && (
          <button type="button" onClick={() => input.current?.click()} aria-label="Add photos"
            className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-umber">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
            </svg>
            <span className="text-xs font-semibold">{items.length ? "Add more" : "Add photos"}</span>
          </button>
        )}
      </div>
      <p className="mt-2 text-xs font-normal text-umber">
        Up to {MAX_PHOTOS} photos. The first one is the cover. Daylight, plain background, and show any flaws.
      </p>
      <input ref={input} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}
