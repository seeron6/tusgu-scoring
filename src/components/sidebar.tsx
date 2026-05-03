"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Settings2,
  Users,
  ClipboardList,
  Trophy,
  Award,
  RefreshCcw,
  LogOut,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/setup", label: "Setup", icon: Settings2 },
  { href: "/students", label: "Students", icon: Users },
  { href: "/scores", label: "Scores", icon: ClipboardList },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/awards", label: "Awards", icon: Award },
  { href: "/sync", label: "Sync", icon: RefreshCcw },
] as const;

export function Sidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Signed out");
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Logout failed");
    }
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#1B3A6B] flex items-center justify-center">
            <span className="text-white text-sm font-bold">T</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#0F172A] leading-tight">TUSGU</div>
            <div className="text-[11px] text-[#64748B] leading-tight">Competition Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                active
                  ? "bg-[#EFF6FF] text-[#1B3A6B]"
                  : "text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]"
              )}
            >
              <Icon className="w-4 h-4" strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[#E2E8F0]">
        <div className="px-3 py-2 mb-1 text-xs">
          <div className="text-[#64748B]">Signed in as</div>
          <div className="text-[#0F172A] font-medium truncate">{username}</div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-[#64748B] hover:bg-red-50 hover:text-[#DC2626] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">{title}</h1>
        {description && <p className="text-sm text-[#64748B] mt-1">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
