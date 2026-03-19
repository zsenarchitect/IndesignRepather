import { NextRequest, NextResponse } from 'next/server';

const GITHUB_OWNER = 'zsenarchitect';
const GITHUB_REPO = 'IndesignRepather';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // Validate path segments to prevent traversal attacks
  if (!path.length || path.some(p => !p || p.includes('..') || p.startsWith('/'))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const githubUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${path.join('/')}`;

  const response = await fetch(githubUrl, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/octet-stream',
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(response.body, {
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Disposition': response.headers.get('Content-Disposition') || '',
    },
  });
}
