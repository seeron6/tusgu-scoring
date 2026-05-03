import * as React from "react";
import { cn } from "@/lib/utils";

const baseField =
  "h-9 w-full rounded-md border border-[#E8E3D7] bg-white px-3 text-sm text-[#1F1E1B] outline-none " +
  "transition-all duration-150 placeholder:text-[#A8A39B] " +
  "hover:border-[#D9D2BE] " +
  "focus:border-[#1B3A6B] focus:ring-[3px] focus:ring-[#1B3A6B]/12 " +
  "disabled:bg-[#F5F2EB] disabled:text-[#7A7770] disabled:cursor-not-allowed";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(baseField, className)} {...rest} />;
  }
);

const selectArrow =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237A7770' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          baseField,
          "appearance-none pr-8 bg-no-repeat bg-[length:14px] bg-[position:right_10px_center]",
          className
        )}
        style={{ backgroundImage: selectArrow }}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-md border border-[#E8E3D7] bg-white px-3 py-2 text-sm text-[#1F1E1B] outline-none",
          "transition-all duration-150 placeholder:text-[#A8A39B] resize-y",
          "hover:border-[#D9D2BE]",
          "focus:border-[#1B3A6B] focus:ring-[3px] focus:ring-[#1B3A6B]/12",
          className
        )}
        {...rest}
      />
    );
  }
);

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...rest }, ref) {
    return (
      <label
        ref={ref}
        className={cn("block text-[12px] font-medium text-[#4A4843] mb-1.5 tracking-wide", className)}
        {...rest}
      />
    );
  }
);

export function FieldHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-[11px] text-[#7A7770] mt-1 leading-relaxed", className)}>{children}</div>;
}
