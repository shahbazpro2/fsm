import Dashboard from "@/components/Dashboard";

/**
 * `text` / `title` / `url` query params arrive here from the PWA Share Target
 * (Android: select SMS → Share → "Fuel Tokens").
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ text?: string; title?: string; url?: string }>;
}) {
  const sp = await searchParams;
  const shared = [sp.title, sp.text, sp.url].filter(Boolean).join("\n").trim();
  return <Dashboard sharedText={shared || undefined} />;
}
