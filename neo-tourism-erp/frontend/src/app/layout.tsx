import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neo Tourism ERP 2.0",
  description: "Internal Enterprise Resource Planning system for Neo Tourism.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
