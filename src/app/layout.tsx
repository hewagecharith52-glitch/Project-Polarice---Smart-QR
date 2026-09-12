import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { restaurantConfig } from "@/config/restaurant.config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f97316",
};

export const metadata: Metadata = {
  title: {
    default: `${restaurantConfig.name} - Smart POS & QR Ordering`,
    template: `%s | ${restaurantConfig.name}`,
  },
  description: "Next Generation Restaurant Point of Sale and Digital Dining Platform",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased print:min-h-0 print:h-auto`}
    >
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-orange-500/30 font-sans print:min-h-0 print:h-auto print:block print:bg-white print:text-black">
        <AuthProvider>
          <SettingsProvider>
            <div className="flex-1 flex flex-col print:block print:h-auto">{children}</div>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}