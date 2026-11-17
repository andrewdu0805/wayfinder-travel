import type { Metadata } from 'next';
import './globals.css';
import { PlacesProvider } from '@/context/PlacesContext';

export const metadata: Metadata = {
  title: 'Wayfinder｜智慧旅遊景點秒存分類與當地動態行程串聯 App',
  description:
    '支援隨手貼 Google Maps 短網址、店名或整段 IG 推薦文案秒存並自動去重，抵達當地依當下想法即時串聯順路動線與一鍵導航。',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className="antialiased bg-[#FAF8F5] text-stone-900">
        <PlacesProvider>{children}</PlacesProvider>
      </body>
    </html>
  );
}
