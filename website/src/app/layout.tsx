import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import DynamicColorProvider from "@/components/DynamicColorProvider";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Morthe",
  description: "Agência focada em experiências digitais com design imersivo, dark mode tecnológico e alta performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`dark scroll-smooth ${geistSans.variable} ${geistMono.variable}`}>
      <body
        className="antialiased bg-zinc-950 text-zinc-50 min-h-screen flex flex-col"
      >
        <DynamicColorProvider>
          <Header />
          <main className="flex-1 relative">
            {children}
          </main>
        </DynamicColorProvider>
        <Analytics />
      </body>
    </html>
  );
}
