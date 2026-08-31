import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'News Timeline',
  description: 'A chronological record of world events, multi-sourced.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}