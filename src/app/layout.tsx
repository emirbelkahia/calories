import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import { AppScroll } from "@/components/AppScroll";
import { LocaleProvider } from "@/components/LocaleProvider";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Calorie Tracker",
  description: "Suivi calories et macros — privé et minimal",
  applicationName: "Calorie Tracker",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Calories",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1F4D3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${outfit.variable} ${fraunces.variable}`}>
      <body>
        <LocaleProvider>
          <div className="app-frame">
            <AppNav />
            <div className="app-shell">
              <AppScroll>{children}</AppScroll>
            </div>
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
