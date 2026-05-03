import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen flex bg-[#FAF9F5]">
      <Sidebar username={session.username} />
      <main className="flex-1 min-w-0 bg-[#FAF9F5]">
        <div className="max-w-[1400px] mx-auto px-10 py-10">{children}</div>
      </main>
    </div>
  );
}
