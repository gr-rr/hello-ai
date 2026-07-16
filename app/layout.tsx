import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hello-ai — Music Studio, Finetune & Compare",
  description:
    "Generate music, fine-tune small LLMs, and compare model outputs — with a server backend on Oracle and Supabase.",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

const NAV = [
  { href: "/", label: "Music" },
  { href: "/chat", label: "Chat" },
  { href: "/data", label: "Datasets" },
  { href: "/train", label: "Train" },
  { href: "/compare", label: "Compare" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        {children}
      </body>
    </html>
  );
}
