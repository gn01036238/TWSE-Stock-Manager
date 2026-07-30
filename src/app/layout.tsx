import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TWSE Stock Manager",
  description: "Taiwan Stock Exchange Portfolio Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
      >
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1 w-full px-2 py-4 sm:px-4 sm:py-6">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
