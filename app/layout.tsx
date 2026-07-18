import type { Metadata } from "next";
import "./globals.css";
import "abcjs/abcjs-audio.css";
import { Geist } from "next/font/google";
import MSWInit from "@/components/MSWInit";
import AuthProvider from "@/components/AuthProvider";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="en" className={`font-sans ${geist.variable}`}>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
        <MSWInit />
      </body>
    </html>
  );
}
