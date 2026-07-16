import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hello-ai — In-Browser Music Studio & Local LLM Chat",
  description:
    "Generate music from text and chat with a local LLM, entirely in your browser via WebGPU and transformers.js.",
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
