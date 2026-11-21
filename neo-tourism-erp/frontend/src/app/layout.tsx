import type { Metadata } from "next";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neo Tourism ERP 2.0",
  description: "Internal Enterprise Resource Planning system for Neo Tourism.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const appEnvironment = process.env.APP_ENV?.trim().toLowerCase();

  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{const saved=localStorage.getItem("neo-theme");document.documentElement.dataset.theme=saved==="light"||saved==="dark"?saved:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch{}`}
        </Script>
        <AuthProvider>
          <AppShell environment={appEnvironment === "uat" ? "uat" : null}>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
