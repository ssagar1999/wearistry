import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
const g = globalThis as unknown as { _mongoose?: Promise<typeof mongoose> };

export function connectDB() {
  if (!uri) throw new Error("MONGODB_URI is not set");
  return (g._mongoose ??= mongoose.connect(uri));
}
