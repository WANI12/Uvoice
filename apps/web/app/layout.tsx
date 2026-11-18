import type { Metadata } from 'next';
import './globals.css';
import './gis-markers.css';
import './phase25.css';
import './situation-room.css';
import './workspace-shell.css';
export const metadata: Metadata = { title: 'SautiWatch South Sudan', description: 'Election early warning and response network' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
