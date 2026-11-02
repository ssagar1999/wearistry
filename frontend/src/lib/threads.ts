import mongoose, { Schema, models, model } from "mongoose";
import { connectDB } from "./db";

export type Reply = { author: string; text: string; at: number };
export type Thread = {
  id: string;
  author: string;
  city: string;
  kind: "post" | "looking" | "swap";
  text: string;
  productId?: string;
  likes: number;
  liked: boolean; // whether the current viewer liked it
  replies: Reply[];
  at: number;
};
type Stored = Omit<Thread, "liked"> & { authorId?: string; likedBy: string[] };

const h = 3600_000;
const seed: Stored[] = [
  { id: "t1", author: "Aarti Rao", city: "Jaipur", kind: "post", text: "Just listed a 90s Dabu wrap skirt. Natural indigo, no fading. Who else loves block prints?", productId: "dabu-block-print-wrap-skirt", likes: 24, replies: [{ author: "Zoya Khan", text: "Gorgeous! Is the waist adjustable?", at: Date.now() - 2 * h }, { author: "Aarti Rao", text: "Yes, it's a full wrap, fits 26–32.", at: Date.now() - h }], likedBy: [], at: Date.now() - 3 * h },
  { id: "t2", author: "Kabir Joshi", city: "Pune", kind: "looking", text: "Looking for a vintage denim jacket, size L, under ₹2,000. Anyone in Pune?", likes: 8, likedBy: [], replies: [], at: Date.now() - 6 * h },
  { id: "t3", author: "Meher Kapoor", city: "Delhi", kind: "swap", text: "Want to swap my Levi's 501 (32) for a linen shirt, size M. DM or reply here!", productId: "levi-s-501-selvedge-jeans", likes: 15, replies: [{ author: "Nisha Reddy", text: "I have a sand linen shirt, M. Interested?", at: Date.now() - 20 * h }], likedBy: [], at: Date.now() - 26 * h },
  { id: "t4", author: "The Bombay Attic", city: "Mumbai", kind: "post", text: "Friday drop at our Bandra store: 40 new pieces, mostly silk and linen. Online from 7pm.", likes: 41, likedBy: [], replies: [], at: Date.now() - 30 * h },
];

// In-memory fallback when MONGODB_URI is unset.
const g = globalThis as unknown as { _threads?: Stored[] };
const mem = (g._threads ??= [...seed]);
const hasDb = () => !!process.env.MONGODB_URI;

const ThreadSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    author: { type: String, required: true },
    authorId: { type: String, index: true },
    city: String,
    kind: { type: String, enum: ["post", "looking", "swap"], default: "post" },
    text: { type: String, required: true, maxlength: 500 },
    productId: String,
    likes: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
    replies: [{ author: String, text: { type: String, maxlength: 500 }, at: Number }],
    at: { type: Number, index: true },
  },
  { timestamps: true },
);
const ThreadModel = (models.Thread as mongoose.Model<any>) || model("Thread", ThreadSchema); // eslint-disable-line @typescript-eslint/no-explicit-any

const toThread = (t: Stored, uid?: string): Thread => ({
  id: t.id, author: t.author, city: t.city, kind: t.kind, text: t.text, productId: t.productId, likes: t.likes, at: t.at,
  liked: !!uid && (t.likedBy ?? []).includes(uid),
  replies: (t.replies ?? []).map(({ author, text, at }) => ({ author, text, at })),
});
const fromDoc = ({ slug, ...d }: Omit<Stored, "id"> & { slug: string }): Stored => ({ ...d, id: slug });

let seeded: Promise<void> | undefined;
async function db() {
  await connectDB();
  seeded ??= (async () => {
    if ((await ThreadModel.estimatedDocumentCount()) > 0) return;
    await ThreadModel.insertMany(seed.map(({ id, ...t }) => ({ slug: id, ...t })), { ordered: false })
      .catch((e) => { if (e?.code !== 11000) throw e; });
  })();
  await seeded;
}

export async function listThreads(uid?: string): Promise<Thread[]> {
  if (!hasDb()) return [...mem].sort((a, b) => b.at - a.at).map((t) => toThread(t, uid));
  await db();
  return (await ThreadModel.find().sort({ at: -1 }).limit(50).lean()).map((d) => toThread(fromDoc(d), uid));
}

export async function createThread(t: Pick<Stored, "authorId" | "author" | "city" | "kind" | "text" | "productId">) {
  const thread: Stored = { ...t, id: Date.now().toString(36), likes: 0, likedBy: [], replies: [], at: Date.now() };
  if (!hasDb()) mem.unshift(thread);
  else {
    await db();
    const { id, ...rest } = thread;
    await ThreadModel.create({ slug: id, ...rest });
  }
  return toThread(thread, t.authorId);
}

// Toggles the viewer's like; one like per user.
export async function likeThread(id: string, uid: string): Promise<{ likes: number; liked: boolean } | null> {
  if (!hasDb()) {
    const t = mem.find((x) => x.id === id);
    if (!t) return null;
    const on = t.likedBy.includes(uid);
    t.likedBy = on ? t.likedBy.filter((x) => x !== uid) : [...t.likedBy, uid];
    t.likes = Math.max(0, t.likes + (on ? -1 : 1));
    return { likes: t.likes, liked: !on };
  }
  await db();
  const opts = { returnDocument: "after" as const, projection: { likes: 1 } };
  const off = await ThreadModel.findOneAndUpdate({ slug: id, likedBy: uid }, { $pull: { likedBy: uid }, $inc: { likes: -1 } }, opts).lean();
  if (off) return { likes: off.likes, liked: false };
  const on = await ThreadModel.findOneAndUpdate({ slug: id, likedBy: { $ne: uid } }, { $addToSet: { likedBy: uid }, $inc: { likes: 1 } }, opts).lean();
  return on ? { likes: on.likes, liked: true } : null;
}

export async function replyThread(id: string, r: Omit<Reply, "at">) {
  const reply = { ...r, at: Date.now() };
  if (!hasDb()) mem.find((x) => x.id === id)?.replies.push(reply);
  else {
    await db();
    await ThreadModel.updateOne({ slug: id }, { $push: { replies: reply } });
  }
  return reply;
}
