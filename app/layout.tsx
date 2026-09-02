import type { Metadata, Viewport } from "next";
import { CANONICAL_SITE_ORIGIN, SALON_NAME } from "../lib/site";
import WebMcpSiteTools from "./webmcp-site-tools";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_SITE_ORIGIN),
  applicationName: SALON_NAME,
  title: {
    default: "Marinela Hair Design | Frizerski salon Solin",
    template: "%s | Marinela Hair Design",
  },
  description:
    "Premium frizerski salon u Solinu za balayage, bojanje, ekstenzije i svečane frizure uz online rezervaciju termina.",
  creator: SALON_NAME,
  publisher: SALON_NAME,
  category: "beauty",
  formatDetection: { address: false, email: false, telephone: false },
  icons: {
    icon: [
      { url: "/marinela-favicon-96.png", type: "image/png", sizes: "96x96" },
      { url: "/marinela-favicon-ornate.svg", type: "image/svg+xml" },
    ],
    shortcut: "/marinela-favicon-96.png",
    apple: "/apple-touch-icon-ornate.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#090909",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr-HR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600&family=Manrope:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <WebMcpSiteTools />
      </body>
    </html>
  );
}
