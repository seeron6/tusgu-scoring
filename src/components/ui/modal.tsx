"use client";
import * as React from "react";
import { X } from "lucide-react";
import { Button } from "./button";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${width} bg-white rounded-2xl shadow-[0_24px_60px_-12px_rgba(31,30,27,0.20)] border border-[#E8E3D7] overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-[#F0EDE5]">
          <div>
            <h2 className="font-serif text-[17px] font-semibold text-[#1F1E1B] tracking-tight leading-snug">
              {title}
            </h2>
            {description && <p className="text-[13px] text-[#7A7770] mt-1 leading-relaxed">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[#7A7770] hover:text-[#1F1E1B] hover:bg-[#F4F1E8] rounded-md p-1.5 transition-colors -mr-1.5 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-[#F0EDE5] bg-[#FAF9F5] flex justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown | Promise<unknown>;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[#4A4843] leading-relaxed">{message}</p>
    </Modal>
  );
}
