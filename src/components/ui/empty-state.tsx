import * as React from "react";
import { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-[#EFF6FF] flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#2563EB]" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-[#0F172A] mb-1">{title}</h3>
      {description && <p className="text-sm text-[#64748B] max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  );
}
