import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${PRODUCT_NAME} — 在线协作`,
    template: `%s · ${PRODUCT_NAME}`,
  },
  description: `${PRODUCT_TAGLINE}。网页访问，支持组织与项目隔离、角色权限与审计。`,
  keywords: ["项目管理", "看板", "甘特图", "协作", "任务", "交付物", "多租户"],
  authors: [{ name: PRODUCT_NAME }],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} — 在线协作`,
    description: PRODUCT_TAGLINE,
  },
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-white font-sans text-gray-900 antialiased`}
        style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
