"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { inr, type Reply, type Thread } from "@/lib/data";
import { photoUrl } from "@/lib/photo";

type Viewer = { name: string } | null;
const LOGIN = "/login?next=/threads";

const kinds = [
  { k: "post", label: "Share", hint: "Show off a find or a new listing…" },
  { k: "looking", label: "Looking for", hint: "What are you hunting for? Size, budget, city…" },
  { k: "swap", label: "Swap", hint: "What do you want to swap, and for what?" },
] as const;
const badge = { post: "", looking: "Looking for", swap: "Swap" };

function ago(at: number) {
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

type Props = { initial: Thread[]; initialCursor: string | null; viewer: Viewer };

export default function ThreadFeed({ initial, initialCursor, viewer }: Props) {
  const router = useRouter();
  const [threads, setThreads] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const patch = (id: string, f: (t: Thread) => Thread) => setThreads((ts) => ts.map((t) => (t.id === id ? f(t) : t)));

  async function toggleLike(t: Thread) {
    if (!viewer) return router.push(LOGIN);
    // Optimistic: flip now, then settle on the server's count (or undo if it failed).
    patch(t.id, (x) => ({ ...x, liked: !x.liked, likes: Math.max(0, x.likes + (x.liked ? -1 : 1)) }));
    const res = await api<{ likes: number; liked: boolean }>(`/threads/${t.id}/like`, { method: t.liked ? "DELETE" : "POST" });
    patch(t.id, (x) => (res.ok ? { ...x, ...res.data } : { ...x, liked: t.liked, likes: t.likes }));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setLoadError("");
    const res = await api<Thread[]>(`/threads?limit=20&cursor=${encodeURIComponent(cursor)}`);
    setLoadingMore(false);
    if (!res.ok) return setLoadError(res.message);
    setThreads((ts) => [...ts, ...res.data.filter((t) => !ts.some((x) => x.id === t.id))]);
    setCursor(res.meta?.nextCursor ?? null);
  }

  return (
    <div className="space-y-4">
      {viewer ? (
        <Composer viewer={viewer} onPosted={(t) => setThreads((ts) => [t, ...ts])} />
      ) : (
        <div className="rounded-xl border border-line bg-white p-5 text-center">
          <p className="font-serif text-xl">Join the conversation</p>
          <p className="mt-1 text-sm text-umber">Log in with your phone number to post, reply and like.</p>
          <Link href={LOGIN} className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-canvas">Log in</Link>
        </div>
      )}
      {threads.map((t) => (
        <ThreadCard key={t.id} t={t} viewer={viewer} onLike={() => toggleLike(t)}
          onReplied={() => patch(t.id, (x) => ({ ...x, replyCount: x.replyCount + 1 }))} />
      ))}
      {!threads.length && <p className="py-10 text-center text-umber">No threads yet. Start the first one!</p>}
      {loadError && <p className="text-center text-sm text-terracotta">{loadError}</p>}
      {cursor && (
        <div className="text-center">
          <button onClick={loadMore} disabled={loadingMore} className="rounded-full border border-ink px-6 py-3 text-sm font-semibold disabled:opacity-50">
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function Composer({ viewer, onPosted }: { viewer: { name: string }; onPosted: (t: Thread) => void }) {
  const [kind, setKind] = useState<(typeof kinds)[number]["k"]>("post");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await api<Thread>("/threads", { method: "POST", body: { kind, text } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onPosted(res.data);
    setText("");
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-white p-4">
      <div className="flex gap-2">
        {kinds.map((x) => (
          <button type="button" key={x.k} onClick={() => setKind(x.k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${kind === x.k ? "bg-ink text-canvas" : "bg-beige"}`}>
            {x.label}
          </button>
        ))}
      </div>
      <textarea required value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3}
        placeholder={kinds.find((x) => x.k === kind)!.hint} className="w-full resize-none rounded-lg border border-line bg-canvas p-3 text-base" />
      {error && <p className="text-sm text-terracotta">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-umber">Posting as {viewer.name}</span>
        <button disabled={busy || !text.trim()} className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-canvas disabled:opacity-40">
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}

function ThreadCard({ t, viewer, onLike, onReplied }: {
  t: Thread; viewer: Viewer; onLike: () => void; onReplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [repliesCursor, setRepliesCursor] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  // Replies are loaded only when a thread is opened, a page at a time.
  async function loadReplies(cursor?: string) {
    const res = await api<Reply[]>(`/threads/${t.id}/replies?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!res.ok) return setError(res.message);
    setReplies((current) => [...(cursor ? current ?? [] : []), ...res.data]);
    setRepliesCursor(res.meta?.nextCursor ?? null);
  }

  function toggleOpen() {
    setOpen(!open);
    if (!open && replies === null) loadReplies();
  }

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api<Reply>(`/threads/${t.id}/replies`, { method: "POST", body: { text } });
    if (!res.ok) return setError(res.message);
    setReplies((current) => [...(current ?? []), res.data]);
    setText("");
    onReplied();
  }

  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-beige font-serif text-lg">{t.author[0]}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t.author}</p>
          <p className="text-xs text-umber">{t.city ? `${t.city} · ` : ""}{ago(t.at)}</p>
        </div>
        {badge[t.kind] && (
          <span className={`label-tag rounded-full px-2.5 py-1 ${t.kind === "swap" ? "bg-forest text-white" : "bg-terracotta text-white"}`}>{badge[t.kind]}</span>
        )}
      </header>
      <p className="mt-3 whitespace-pre-line text-[15px] leading-6">{t.text}</p>
      {t.product && (
        <Link href={`/product/${t.product.id}`} className="mt-3 flex items-center gap-3 rounded-lg bg-canvas p-2">
          <img src={photoUrl(t.product.image, 480)} alt="" className="h-16 w-14 rounded object-cover" />
          <div><p className="font-serif">{t.product.title}</p><p className="text-sm font-semibold">{inr(t.product.price)}</p></div>
        </Link>
      )}
      <div className="mt-3 flex gap-2 text-sm">
        <button onClick={onLike} aria-pressed={t.liked} className={`rounded-full px-3 py-2 ${t.liked ? "bg-terracotta/10 text-terracotta" : "bg-beige"}`}>
          {t.liked ? "♥" : "♡"} {t.likes}
        </button>
        <button onClick={toggleOpen} aria-expanded={open} className="rounded-full bg-beige px-3 py-2">
          💬 {t.replyCount ? `${t.replyCount} ${t.replyCount === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {replies === null && <p className="text-sm text-umber">Loading replies…</p>}
          {replies?.map((r) => (
            <div key={r.id} className="text-sm"><span className="font-semibold">{r.author}</span> <span className="text-umber">· {ago(r.at)}</span><p>{r.text}</p></div>
          ))}
          {repliesCursor && (
            <button onClick={() => loadReplies(repliesCursor)} className="text-sm font-semibold underline">Show more replies</button>
          )}
          {error && <p className="text-sm text-terracotta">{error}</p>}
          {viewer ? (
            <form onSubmit={reply} className="flex gap-2">
              <input required value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Write a reply…"
                className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-4 py-2.5 text-base" />
              <button disabled={!text.trim()} className="rounded-full bg-ink px-4 text-sm font-semibold text-canvas disabled:opacity-40">Send</button>
            </form>
          ) : (
            <Link href={LOGIN} className="block text-sm font-semibold underline">Log in to reply</Link>
          )}
        </div>
      )}
    </article>
  );
}
