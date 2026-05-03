"use client";
import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Lock, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";

const STORAGE_KEY = "tusgu.unlocked";
const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD ?? "internalcomp26";

type AuthState = {
  unlocked: boolean;
  unlock: (password: string) => boolean;
  lock: () => void;
};

const AuthCtx = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY) === "1") setUnlocked(true);
  }, []);

  const unlock = React.useCallback((password: string) => {
    if (password === APP_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const lock = React.useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setUnlocked(false);
  }, []);

  return <AuthCtx.Provider value={{ unlocked, unlock, lock }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Wrap a protected page. If not unlocked, shows a full-page password prompt.
 */
export function ProtectedPage({ children, label }: { children: React.ReactNode; label?: string }) {
  const { unlocked, unlock } = useAuth();
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!unlocked && inputRef.current) inputRef.current.focus();
  }, [unlocked]);

  if (unlocked) return <>{children}</>;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = unlock(password);
    setBusy(false);
    if (!ok) {
      toast.error("Incorrect password");
      setPassword("");
      inputRef.current?.focus();
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-[#E8E3D7] rounded-2xl shadow-[0_24px_60px_-12px_rgba(31,30,27,0.10)] p-7"
      >
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-[#F4F1E8] flex items-center justify-center mb-3">
            <Lock className="w-5 h-5 text-[#1B3A6B]" />
          </div>
          <h1 className="font-serif text-[20px] font-semibold text-[#1F1E1B]">
            {label ? `Unlock ${label}` : "Password required"}
          </h1>
          <p className="text-[13px] text-[#7A7770] mt-1.5 leading-relaxed">
            This page is restricted. Enter the competition password to continue.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <Label>Password</Label>
            <Input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy || !password}>
            {busy ? "Checking…" : "Unlock"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * For inline guards — e.g. "Save scores" button asks for the password if not yet unlocked.
 */
export function PasswordModal({
  open,
  onClose,
  onSuccess,
  label,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  label?: string;
}) {
  const { unlock } = useAuth();
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    if (open) setPassword("");
  }, [open]);

  function submit() {
    if (unlock(password)) {
      onSuccess();
      onClose();
    } else {
      toast.error("Incorrect password");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={label ?? "Password required"}
      width="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!password}>
            Unlock
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-2.5 text-sm text-[#4A4843] bg-[#FAF1E5] border border-[#F0DEB8] rounded-md p-3">
          <ShieldAlert className="w-4 h-4 mt-0.5 text-[#B8651A] shrink-0" />
          <div>This action requires the competition password.</div>
        </div>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Enter password"
        />
      </div>
    </Modal>
  );
}
