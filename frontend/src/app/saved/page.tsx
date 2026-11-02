import SavedList from "@/components/SavedList";
import { listProducts } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function Saved() {
  return (
    <div className="py-8">
      <h1 className="font-serif text-[28px] md:text-4xl">Saved</h1>
      <SavedList all={await listProducts()} />
    </div>
  );
}
