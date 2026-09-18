import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Patrimo',
  description: 'Suivi budgetaire et patrimonial personnel',
  manifest: '/manifest.webmanifest',
  applicationName: 'Patrimo',
  appleWebApp: {
    // Sans ces trois lignes, iOS ouvre l'icone de l'ecran d'accueil dans
    // Safari avec sa barre d'adresse au lieu d'une fenetre autonome.
    capable: true,
    title: 'Patrimo',
    statusBarStyle: 'default',
  },
  formatDetection: {
    // iOS transforme sinon les montants et les dates en liens telephoniques.
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // `viewport-fit=cover` est ce qui donne acces aux variables env(safe-area-*)
  // et permet a l'app d'occuper tout l'ecran sous l'encoche.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f8f6' },
    { media: '(prefers-color-scheme: dark)', color: '#121214' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
