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
    <aside className="w-[248px] shrink-0 bg-[#FAF9F5] border-r border-[#E8E3D7] flex flex-col h-screen sticky top-0">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#1B3A6B] flex items-center justify-center shadow-[0_2px_4px_-1px_rgba(27,58,107,0.25)]">
            <span className="text-white text-sm font-semibold tracking-tight font-serif">T</span>
          </div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-[#1F1E1B] font-serif tracking-tight">TUSGU</div>
            <div className="text-[11px] text-[#7A7770]">Competition Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] font-medium transition-all duration-150",
                active
                  ? "bg-white text-[#1B3A6B] shadow-[0_1px_2px_0_rgba(31,30,27,0.04),0_0_0_1px_rgba(232,227,215,0.6)]"
                  : "text-[#4A4843] hover:bg-white/70 hover:text-[#1F1E1B]"
              )}
            >
              <Icon
                className={cn(
                  "w-[15px] h-[15px] transition-colors",
                  active ? "text-[#1B3A6B]" : "text-[#7A7770] group-hover:text-[#1F1E1B]"
                )}
                strokeWidth={1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[#E8E3D7]">
        <div className="px-3 py-2 mb-1">
          <div className="text-[10px] uppercase tracking-wider text-[#A8A39B] mb-0.5">Signed in</div>
          <div className="text-[13px] text-[#1F1E1B] font-medium truncate">{username}</div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] font-medium text-[#7A7770] hover:bg-[#FAEEE9] hover:text-[#B8341A] transition-colors"
        >
          <LogOut className="w-[15px] h-[15px]" strokeWidth={1.75} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 mb-8">
      <div>
        <h1 className="font-serif text-[28px] leading-tight font-semibold text-[#1F1E1B] tracking-tight">{title}</h1>
        {description && (
          <p className="text-[14px] text-[#7A7770] mt-1.5 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 pb-1">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-[#E8E3D7] shadow-[0_1px_2px_0_rgba(31,30,27,0.03)] overflow-hidden",
        padded && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  icon: Icon,
  actions,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />}
        <h2 className="text-[13px] font-semibold text-[#1F1E1B]">{title}</h2>
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
