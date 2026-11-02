"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Thread } from "@/lib/threads";
import { photoUrl } from "@/lib/photo";

type Mini = { title: string; price: string; image: string };
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

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function ThreadFeed({ initial, minis, viewer }: { initial: Thread[]; minis: Record<string, Mini>; viewer: Viewer }) {
  const router = useRouter();
  const [threads, setThreads] = useState(initial);
  const patch = (id: string, f: (t: Thread) => Thread) => setThreads((ts) => ts.map((t) => (t.id === id ? f(t) : t)));

  async function toggleLike(t: Thread) {
    if (!viewer) return router.push(LOGIN);
    patch(t.id, (x) => ({ ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) }));
    const res = await post(`/api/threads/${t.id}`, { action: "like" });
    if (res.ok) { const r = await res.json(); patch(t.id, (x) => ({ ...x, ...r })); }
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
        <ThreadCard key={t.id} t={t} mini={t.productId ? minis[t.productId] : undefined} viewer={viewer}
          onLike={() => toggleLike(t)} onReply={(r) => patch(t.id, (x) => ({ ...x, replies: [...x.replies, r] }))} />
      ))}
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
    const res = await post("/api/threads", { kind, text });
    setBusy(false);
    if (!res.ok) return setError("Couldn’t post that. Write a few words and try again.");
    onPosted(await res.json());
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

function ThreadCard({ t, mini, viewer, onLike, onReply }: {
  t: Thread; mini?: Mini; viewer: Viewer; onLike: () => void; onReply: (r: Thread["replies"][number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    const res = await post(`/api/threads/${t.id}`, { action: "reply", text });
    if (res.ok) { onReply(await res.json()); setText(""); }
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
      {mini && t.productId && (
        <Link href={`/product/${t.productId}`} className="mt-3 flex items-center gap-3 rounded-lg bg-canvas p-2">
          <img src={photoUrl(mini.image, 480)} alt="" className="h-16 w-14 rounded object-cover" />
          <div><p className="font-serif">{mini.title}</p><p className="text-sm font-semibold">{mini.price}</p></div>
        </Link>
      )}
      <div className="mt-3 flex gap-2 text-sm">
        <button onClick={onLike} aria-pressed={t.liked} className={`rounded-full px-3 py-2 ${t.liked ? "bg-terracotta/10 text-terracotta" : "bg-beige"}`}>
          {t.liked ? "♥" : "♡"} {t.likes}
        </button>
        <button onClick={() => setOpen(!open)} className="rounded-full bg-beige px-3 py-2">
          💬 {t.replies.length ? `${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {t.replies.map((r, i) => (
            <div key={i} className="text-sm"><span className="font-semibold">{r.author}</span> <span className="text-umber">· {ago(r.at)}</span><p>{r.text}</p></div>
          ))}
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
