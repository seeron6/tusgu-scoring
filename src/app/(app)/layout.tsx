import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#FAF9F5]">
      <Sidebar />
      <main className="flex-1 min-w-0 bg-[#FAF9F5]">
        {/* Use the full available width on wide monitors. The previous
            max-w-[1400px] was leaving large empty bands on 1920+ screens. */}
        <div className="w-full px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
