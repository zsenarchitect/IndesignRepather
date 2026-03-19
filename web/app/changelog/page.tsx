export default function ChangelogPage() {
  return (
    <>
      <h1 style={{ fontSize: '2rem', marginBottom: 32, color: '#fff' }}>
        Changelog
      </h1>

      <section
        style={{
          padding: 24,
          border: '1px solid #333',
          borderRadius: 8,
          backgroundColor: '#1a1a1a',
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: '#fff' }}>
          v0.1.0
        </h2>
        <p style={{ color: '#888', marginBottom: 12 }}>Initial release</p>
        <ul style={{ color: '#bbb', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Scan InDesign files for linked asset paths</li>
          <li>Find-and-replace path mappings</li>
          <li>Automatic mapping discovery from common prefixes</li>
          <li>Side-by-side preview of changes before applying</li>
          <li>Batch processing of entire folders</li>
        </ul>
      </section>
    </>
  );
}
