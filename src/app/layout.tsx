import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import PwaRegister from "@/components/PwaRegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.appvellox.online"),
  title: "Vellox — Gestão de Entregas",
  description: "Sistema de gestão de motoboys e pedidos em tempo real",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vellox" },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple:    "/icon",
    shortcut: "/icon",
  },
  openGraph: {
    title: "Vellox — Gestão de Entregas",
    description: "Sistema de gestão de motoboys e pedidos em tempo real",
    url: "https://www.appvellox.online",
    siteName: "Vellox",
    images: [{ url: "/linkvellox.jpg", width: 1200, height: 630, alt: "Vellox" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vellox — Gestão de Entregas",
    description: "Sistema de gestão de motoboys e pedidos em tempo real",
    images: ["/linkvellox.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor:   "#E4002B",
  width:        "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <head>
        {/* Anti-flash: aplica dark theme antes do React hidratar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('vellox-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');})();`,
          }}
        />
      </head>
      <body className="h-full antialiased">
        <PwaRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
