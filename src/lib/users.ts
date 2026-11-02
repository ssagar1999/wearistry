import mongoose, { Schema, models, model } from "mongoose";
import { randomUUID } from "crypto";
import { connectDB } from "./db";

export type User = { id: string; phone: string; name: string; city: string };

const hasDb = () => !!process.env.MONGODB_URI;
const g = globalThis as unknown as { _users?: Map<string, User> };
const mem = (g._users ??= new Map<string, User>()); // keyed by phone

const UserSchema = new Schema(
  {
    uid: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true, match: /^[6-9]\d{9}$/ },
    name: { type: String, default: "", maxlength: 40 },
    city: { type: String, default: "", maxlength: 40 },
  },
  { timestamps: true },
);
const UserModel = (models.User as mongoose.Model<any>) || model("User", UserSchema); // eslint-disable-line @typescript-eslint/no-explicit-any

const toUser = (d: { uid: string; phone: string; name?: string; city?: string }): User => ({
  id: d.uid, phone: d.phone, name: d.name ?? "", city: d.city ?? "",
});

export async function findOrCreateUser(phone: string): Promise<User> {
  if (!hasDb()) {
    let u = mem.get(phone);
    if (!u) mem.set(phone, (u = { id: randomUUID(), phone, name: "", city: "" }));
    return u;
  }
  await connectDB();
  const d = await UserModel.findOneAndUpdate(
    { phone },
    { $setOnInsert: { uid: randomUUID() } }, // phone comes from the filter
    { upsert: true, new: true },
  ).lean();
  return toUser(d);
}

export async function getUserById(id: string): Promise<User | null> {
  if (!hasDb()) return [...mem.values()].find((u) => u.id === id) ?? null;
  await connectDB();
  const d = await UserModel.findOne({ uid: id }).lean();
  return d ? toUser(d) : null;
}

export async function updateProfile(id: string, p: { name: string; city: string }): Promise<User | null> {
  if (!hasDb()) {
    const u = [...mem.values()].find((x) => x.id === id);
    if (u) Object.assign(u, p);
    return u ?? null;
  }
  await connectDB();
  const d = await UserModel.findOneAndUpdate({ uid: id }, { $set: p }, { new: true }).lean();
  return d ? toUser(d) : null;
}
