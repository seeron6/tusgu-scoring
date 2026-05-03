import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: "bg-[#1B3A6B] hover:bg-[#152d54] text-white",
  secondary: "bg-[#2563EB] hover:bg-[#1d4ed8] text-white",
  ghost: "bg-transparent hover:bg-slate-100 text-[#0F172A]",
  danger: "bg-[#DC2626] hover:bg-red-700 text-white",
  outline: "bg-white hover:bg-slate-50 text-[#0F172A] border border-[#E2E8F0]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#2563EB]/40",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    />
  );
});
