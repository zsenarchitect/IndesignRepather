export default function GuidePage() {
  const steps = [
    {
      title: '1. Download and Install',
      body: 'Grab the latest installer from the releases page and run it. The app installs like any standard Windows application.',
    },
    {
      title: '2. Select Your InDesign Files',
      body: 'Point the app at a folder or pick individual .indd files. It will scan them and list every linked asset path it finds.',
    },
    {
      title: '3. Define or Discover Path Mappings',
      body: 'Enter find-and-replace rules manually (e.g. old server path to new server path), or let the app suggest mappings based on common path prefixes it detects.',
    },
    {
      title: '4. Preview Changes',
      body: 'Review a side-by-side diff of every link that will be updated. Nothing is written until you confirm.',
    },
    {
      title: '5. Execute and Save',
      body: 'Apply the changes. The app updates the InDesign documents in place, fixing each broken link to its new location.',
    },
  ];

  return (
    <>
      <h1 style={{ fontSize: '2rem', marginBottom: 32, color: '#fff' }}>
        Getting Started
      </h1>

      {steps.map((step) => (
        <section
          key={step.title}
          style={{
            marginBottom: 32,
            padding: 24,
            border: '1px solid #333',
            borderRadius: 8,
            backgroundColor: '#1a1a1a',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', marginTop: 0, color: '#fff' }}>
            {step.title}
          </h2>
          <p style={{ color: '#bbb', lineHeight: 1.7, margin: 0 }}>
            {step.body}
          </p>
        </section>
      ))}
    </>
  );
}
