import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduCareLink - Trợ lý gia đình, Việc làm linh hoạt",
  description: "Nền tảng kết nối phụ huynh với carepartner. Tìm gia sư, người trông trẻ, đón trẻ, dọn dẹp nhà cửa nhanh chóng và tin cậy.",
  keywords: ["EduCareLink", "gia sư", "trông trẻ", "đón trẻ", "dọn dẹp", "carepartner", "phụ huynh"],
  authors: [{ name: "EduCareLink Team" }],
  openGraph: {
    title: "EduCareLink",
    description: "Kết nối tri thức, nuôi dưỡng tương lai",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
