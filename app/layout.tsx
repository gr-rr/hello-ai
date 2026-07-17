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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
