import { redirect } from "next/navigation";
import LoginFlow from "@/components/LoginFlow";
import { currentUser } from "@/lib/session";
import { safeNext } from "@/lib/next";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await currentUser();
  if (user?.name) redirect(next);
  return <LoginFlow next={next} startAt={user ? "profile" : "phone"} />;
}
