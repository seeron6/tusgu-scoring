import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "subtle";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-[#1B3A6B] hover:bg-[#152d54] text-white shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_1px_2px_0_rgba(31,30,27,0.08)]",
  secondary:
    "bg-[#1F1E1B] hover:bg-[#322F2A] text-[#FAF9F5] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_1px_2px_0_rgba(31,30,27,0.08)]",
  ghost:
    "bg-transparent hover:bg-[#F4F1E8] text-[#1F1E1B]",
  danger:
    "bg-[#B8341A] hover:bg-[#9A2B16] text-white",
  outline:
    "bg-white hover:bg-[#FAF9F5] text-[#1F1E1B] border border-[#E8E3D7] hover:border-[#D9D2BE]",
  subtle:
    "bg-[#F4F1E8] hover:bg-[#E8E3D7] text-[#1B3A6B]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-11 px-5 text-sm",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150 ease-out",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF9F5] focus-visible:ring-[#1B3A6B]/30",
        "active:scale-[0.99]",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    />
  );
});
