import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'InDesign Repather — Ennead Architects',
  description:
    'Fix broken InDesign links when projects move between servers or folders.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          backgroundColor: '#111',
          color: '#e0e0e0',
          minHeight: '100vh',
        }}
      >
        <nav
          style={{
            padding: '16px 32px',
            borderBottom: '1px solid #333',
            display: 'flex',
            gap: '24px',
            alignItems: 'center',
          }}
        >
          <a href="/indesign-repather" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
            InDesign Repather
          </a>
          <a href="/indesign-repather/guide" style={{ color: '#aaa', textDecoration: 'none' }}>
            Guide
          </a>
          <a href="/indesign-repather/changelog" style={{ color: '#aaa', textDecoration: 'none' }}>
            Changelog
          </a>
        </nav>
        <main style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
