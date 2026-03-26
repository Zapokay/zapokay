import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZapOkay — Corporate Minute Book',
  description: 'Your corporate minute book, simplified. | Votre livre des minutes, simplifié.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
