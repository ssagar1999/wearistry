import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";
import { currentUser } from "@/lib/session";
import { maskPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function Account() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");
  if (!user.name) redirect("/login?next=/account");
  return (
    <div className="mx-auto max-w-sm space-y-6 py-10">
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-beige font-serif text-2xl">{user.name[0]}</div>
        <div>
          <h1 className="font-serif text-[28px] leading-tight">{user.name}</h1>
          <p className="text-sm text-umber">
            {[user.city, user.phone ? maskPhone(user.phone) : user.email].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {!user.phone && (
        <Link href="/login?verify=phone&next=/account" className="block rounded-xl bg-beige p-4 text-sm">
          <b>Add your phone number</b> to buy and sell. It’s only shared with people you trade with.
        </Link>
      )}
      <div className="grid gap-2">
        <Link href="/sell" className="rounded-xl border border-line bg-white p-4 font-medium">List a piece</Link>
        <Link href="/saved" className="rounded-xl border border-line bg-white p-4 font-medium">Saved items</Link>
        <Link href="/threads" className="rounded-xl border border-line bg-white p-4 font-medium">Threads</Link>
      </div>
      <LogoutButton />
    </div>
  );
}
