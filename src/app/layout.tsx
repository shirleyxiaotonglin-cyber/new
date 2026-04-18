import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
    default: "ProjectHub — 企业级项目管理",
    template: "%s · ProjectHub",
  },
  description: "多租户协作、看板甘特、RBAC 与审计。网页访问，响应式布局。",
  keywords: ["项目管理", "看板", "甘特图", "协作", "SaaS", "多租户"],
  authors: [{ name: "ProjectHub" }],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: siteUrl,
    siteName: "ProjectHub",
    title: "ProjectHub — 企业级项目管理",
    description: "在浏览器中管理项目：看板、列表、甘特与报表。",
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
