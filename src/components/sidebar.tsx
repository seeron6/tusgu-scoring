"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Settings2,
  Users,
  ClipboardList,
  Trophy,
  Award,
  RefreshCcw,
  Lock,
  Unlock,
  Menu,
  X,
  GraduationCap,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-gate";

const NAV = [
  { href: "/students", label: "Students", icon: Users, locked: false },
  { href: "/scores", label: "Scores", icon: ClipboardList, locked: true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, locked: true },
  { href: "/awards", label: "Awards", icon: Award, locked: true },
  { href: "/coaches", label: "Coaches", icon: GraduationCap, locked: true },
  { href: "/setup", label: "Setup", icon: Settings2, locked: true },
  { href: "/sync", label: "Sync", icon: RefreshCcw, locked: true },
] as const;

const LOGO_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/brand-logo.jpeg`;

export function Sidebar() {
  const pathname = usePathname();
  const { unlocked, lock } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#FAF9F5] border-b border-[#E8E3D7] sticky top-0 z-30">
        <Link href="/students" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_URL} alt="TUSGU Educational Services" className="h-9 w-auto" />
        </Link>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 -mr-2 text-[#1F1E1B]"
          aria-label="Toggle navigation"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      <aside
        className={cn(
          "bg-[#FAF9F5] border-r border-[#E8E3D7] flex-col",
          "md:w-[248px] md:shrink-0 md:flex md:h-screen md:sticky md:top-0",
          mobileOpen ? "flex" : "hidden md:flex"
        )}
      >
        <div className="hidden md:block px-5 pt-6 pb-5">
          <Link href="/students" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_URL} alt="TUSGU Educational Services" className="h-12 w-auto" />
            <div className="text-[10.5px] tracking-[0.18em] uppercase text-[#7A7770] mt-2 ml-1">
              Competition Portal
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-3 md:py-2 space-y-0.5 overflow-y-auto">
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
                <span className="flex-1">{item.label}</span>
                {item.locked && !unlocked && (
                  <Lock className="w-3 h-3 text-[#A8A39B]" strokeWidth={1.75} />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-[#E8E3D7]">
          {unlocked ? (
            <button
              onClick={() => {
                lock();
                toast.success("Locked");
              }}
              className="w-full flex items-center gap-3 px-3 py-[7px] rounded-md text-[13px] font-medium text-[#4A4843] hover:bg-[#FAEEE9] hover:text-[#B8341A] transition-colors"
              title="Lock protected pages on this device"
            >
              <Unlock className="w-[15px] h-[15px]" strokeWidth={1.75} />
              Unlocked — click to lock
            </button>
          ) : (
            <div className="px-3 py-2 text-[12px] text-[#7A7770] flex items-center gap-2">
              <Lock className="w-[14px] h-[14px]" strokeWidth={1.75} />
              <span>Some pages need a password.</span>
            </div>
          )}
        </div>
      </aside>
    </>
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
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6 mb-6 md:mb-8">
      <div className="min-w-0">
        <h1 className="font-serif text-[22px] sm:text-[26px] md:text-[28px] leading-tight font-semibold text-[#1F1E1B] tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-[13px] sm:text-[14px] text-[#7A7770] mt-1.5 max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
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
    <div className="px-5 py-4 border-b border-[#F0EDE5] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-[15px] h-[15px] text-[#7A7770]" strokeWidth={1.75} />}
        <h2 className="text-[13px] font-semibold text-[#1F1E1B] truncate">{title}</h2>
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
