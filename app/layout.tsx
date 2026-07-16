import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hello-ai — Local LLM Chat",
  description:
    "Run local LLM inference in your browser via WebGPU. Built for future Unsloth finetuning demos.",
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
