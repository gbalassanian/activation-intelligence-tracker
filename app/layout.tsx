import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ElevenLabs Activation Tracker',
  description:
    'Internal adoption and operations control center: 30-day onboarding funnel, Time-to-First-Value telemetry, and proactive remediation for ElevenLabs Conversational AI workspaces.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Fonts are linked rather than bundled so the app builds and runs with
          no network access; the system stacks below take over when offline.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `:root{--font-inter:'Inter';--font-jetbrains-mono:'JetBrains Mono';}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-zinc-900">{children}</body>
    </html>
  );
}
