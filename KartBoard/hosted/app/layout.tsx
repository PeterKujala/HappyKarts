import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kart Board — Live practice updates',
  description: 'A shared live practice board and controller for kart clubs, officials, drivers, and families.',
  openGraph: {
    title: 'Kart Board',
    description: 'Live practice updates, anywhere.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Kart Board — Live practice updates, anywhere.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kart Board',
    description: 'Live practice updates, anywhere.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU"><body>{children}</body></html>;
}
