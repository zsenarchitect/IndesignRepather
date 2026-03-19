export default function Home() {
  const RELEASE_URL =
    'https://github.com/zsenarchitect/IndesignRepather/releases/latest';

  return (
    <>
      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '60px 0 48px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: 12, color: '#fff' }}>
          InDesign Repather
        </h1>
        <p style={{ fontSize: '1.25rem', color: '#999', marginBottom: 32 }}>
          Fix broken links when projects move between servers or folders.
        </p>
        <a
          href={RELEASE_URL}
          style={{
            display: 'inline-block',
            padding: '14px 36px',
            backgroundColor: '#2563eb',
            color: '#fff',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '1rem',
          }}
        >
          Download Latest Release
        </a>
      </section>

      {/* Features */}
      <section style={{ padding: '32px 0' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: 16, color: '#fff' }}>
          What It Does
        </h2>
        <ul style={{ lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Scans InDesign files (.indd) for linked assets (images, placed PDFs, etc.)</li>
          <li>Lets you define find-and-replace path mappings or discover them automatically</li>
          <li>Previews every change before writing anything</li>
          <li>Batch-processes entire folders of InDesign documents</li>
        </ul>
      </section>

      {/* Requirements */}
      <section style={{ padding: '32px 0' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: 16, color: '#fff' }}>
          Requirements
        </h2>
        <ul style={{ lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Windows 10 or Windows 11</li>
          <li>Adobe InDesign CC 2020 or later</li>
        </ul>
      </section>
    </>
  );
}
