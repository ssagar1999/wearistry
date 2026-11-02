import { redirect } from "next/navigation";
import LoginFlow from "@/components/LoginFlow";
import { currentUser } from "@/lib/session";
import { safeNext } from "@/lib/next";

export const dynamic = "force-dynamic";

type Search = { next?: string; step?: string; verify?: string; error?: string };

export default async function Login({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const user = await currentUser();
  const needsPhone = params.verify === "phone" && user && !user.phone;

  if (user?.name && !needsPhone) redirect(next);

  return (
    <LoginFlow
      next={next}
      mode={needsPhone ? "verify-phone" : "login"}
      startAt={user && !needsPhone ? "profile" : "phone"}
      // The API answers 503 for Google when it isn't configured; hiding the button avoids a dead end.
      googleEnabled={process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "true"}
      initialError={params.error}
    />
  );
}
