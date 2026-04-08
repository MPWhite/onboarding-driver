import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PipMount } from './pip-mount';
import './globals.css';

export const metadata: Metadata = {
  title: 'Acme Projects — pip demo',
  description:
    'A fake project-management app used to dogfood the pip help widget.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PipMount />
      </body>
    </html>
  );
}
