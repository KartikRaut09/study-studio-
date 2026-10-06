import type { Metadata } from "next";
import "./globals.css";
import "./tracker.css";

export const metadata: Metadata = {
  title: "GATE DA Study Studio",
  description: "Your daily GATE DA study plan, syllabus checklist and learning progress.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
