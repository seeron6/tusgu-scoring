import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-gate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TUSGU Scoring — Competition Portal",
  description: "TUSGU Educational Services competition score management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-right"
          gutter={8}
          toastOptions={{
            style: {
              fontSize: "0.825rem",
              background: "#1F1E1B",
              color: "#FAF9F5",
              borderRadius: "8px",
              padding: "10px 14px",
              boxShadow: "0 8px 24px rgba(31,30,27,0.16)",
            },
            success: { iconTheme: { primary: "#9BC395", secondary: "#1F1E1B" } },
            error: { iconTheme: { primary: "#E89579", secondary: "#1F1E1B" } },
          }}
        />
      </body>
    </html>
  );
}
