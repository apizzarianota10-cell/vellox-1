import type { Metadata, Viewport } from "next";
import MotoboyPwa from "@/components/motoboy/MotoboyPwa";

// Manifest próprio do app do motoboy (start_url/scope /motoboy). Sobrescreve o
// /manifest.json do layout raiz só nesta seção — o painel da empresa continua
// com o dele.
export const metadata: Metadata = {
  title: "Vellox Motoboy",
  manifest: "/motoboy-manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vellox Motoboy" },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: "/motoboy-icone?s=180",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#E4002B",
};

export default function MotoboyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MotoboyPwa />
    </>
  );
}
