import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Marcellus } from 'next/font/google';
import './globals.css';
import { Shell } from '@/components/ui/Shell';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const marcellus = Marcellus({ variable: '--font-marcellus', subsets: ['latin'], weight: '400' });

export const metadata: Metadata = {
  title: { default: 'SOBHA OneWorld — Spatial Explorer', template: '%s · SOBHA OneWorld' },
  description: '3D, VR and geospatial exploration of SOBHA OneWorld, Greater Whitefield, Bengaluru. 1:1 floor plans, site model and location intelligence.',
};

export const viewport: Viewport = { themeColor: '#0b0d10', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${marcellus.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
