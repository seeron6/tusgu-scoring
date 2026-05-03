"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
        return;
      }
      router.replace("/setup");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(440px,520px)] bg-[#FAF9F5]">
      <div className="hidden lg:flex bg-[#1B3A6B] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center font-serif text-lg font-semibold">
              T
            </div>
            <div className="font-serif text-lg font-semibold tracking-tight">TUSGU</div>
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-3xl font-semibold leading-tight tracking-tight mb-3">
              Internal Competition Portal
            </h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Manage students, score mental math competitions, and prepare awards — all from one secure
              workspace for TUSGU Educational Services.
            </p>
          </div>
          <div className="text-[11px] text-white/50">
            © {new Date().getFullYear()} TUSGU Educational Services
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className={`w-full max-w-sm ${shaking ? "animate-shake" : ""}`}>
          <div className="lg:hidden mb-8 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[#1B3A6B] flex items-center justify-center font-serif text-white font-semibold">
              T
            </div>
            <div className="font-serif text-lg font-semibold text-[#1F1E1B]">TUSGU</div>
          </div>

          <h1 className="font-serif text-[26px] font-semibold text-[#1F1E1B] tracking-tight mb-1.5">
            Welcome back
          </h1>
          <p className="text-[14px] text-[#7A7770] mb-8 leading-relaxed">
            Sign in with your TUSGU staff credentials to continue.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[#4A4843] mb-1.5 tracking-wide">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                className="w-full h-11 px-3.5 rounded-md border border-[#E8E3D7] bg-white text-[#1F1E1B] outline-none transition-all hover:border-[#D9D2BE] focus:border-[#1B3A6B] focus:ring-[3px] focus:ring-[#1B3A6B]/12"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#4A4843] mb-1.5 tracking-wide">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full h-11 px-3.5 rounded-md border border-[#E8E3D7] bg-white text-[#1F1E1B] outline-none transition-all hover:border-[#D9D2BE] focus:border-[#1B3A6B] focus:ring-[3px] focus:ring-[#1B3A6B]/12"
              />
            </div>
            {error && (
              <div className="text-[13px] text-[#B8341A] bg-[#FAEEE9] border border-[#F2D5C9] rounded-md px-3 py-2.5 leading-snug">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 rounded-md bg-[#1B3A6B] hover:bg-[#152d54] active:scale-[0.99] text-white text-[14px] font-medium transition-all disabled:opacity-60 shadow-[0_1px_2px_0_rgba(27,58,107,0.2)]"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
