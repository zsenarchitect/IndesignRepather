import { DocumentInfo, LinkInfo, LINK_STATUS, INTERACTION_LEVEL } from '../shared/types';

let app: any = null;
let comBridge: string = 'none';

// Try to load a COM bridge - this will be resolved at runtime on Windows
function getComBridge(): { createObject: (progId: string) => any } {
  // In packaged app or dev, try win32ole first
  try {
    const win32ole = require('win32ole');
    comBridge = 'win32ole';
    return {
      createObject: (progId: string) => new win32ole.Object(progId),
    };
  } catch {
    // win32ole not available
  }

  // Fallback: edge-js
  try {
    const edge = require('edge-js');
    comBridge = 'edge-js';
    return {
      createObject: (progId: string) => {
        // edge-js COM bridge would go here
        throw new Error('edge-js COM bridge not yet implemented');
      },
    };
  } catch {
    // edge-js not available
  }

  throw new Error(
    'No COM bridge available. This app requires Windows with win32ole or edge-js installed.'
  );
}

let bridge: ReturnType<typeof getComBridge> | null = null;

function ensureBridge() {
  if (!bridge) {
    bridge = getComBridge();
  }
  return bridge;
}

export function connect(version?: string): { version: string; bridge: string } {
  const b = ensureBridge();
  const progId = version ? `InDesign.Application.${version}` : 'InDesign.Application';

  try {
    app = b.createObject(progId);
  } catch (e: any) {
    const msg = String(e);
    if (msg.includes('Class not registered')) {
      throw new Error('InDesign is not installed or COM is not registered');
    }
    if (msg.includes('Operation unavailable')) {
      throw new Error('InDesign is not running. Please launch InDesign first.');
    }
    if (msg.includes('Access is denied')) {
      throw new Error('Access denied. Try running as administrator.');
    }
    throw new Error(`Failed to connect to InDesign: ${msg}`);
  }

  const appVersion = String(app.Version);
  return { version: appVersion, bridge: comBridge };
}

export function isConnected(): boolean {
  return app !== null;
}

export function getOpenDocuments(): { name: string; path: string }[] {
  if (!app) throw new Error('Not connected to InDesign');

  const docs: { name: string; path: string }[] = [];
  const count = app.Documents.Count;
  for (let i = 0; i < count; i++) {
    const doc = app.Documents.Item(i);
    docs.push({
      name: String(doc.Name),
      path: String(doc.FilePath),
    });
  }
  return docs;
}

function mapLinkStatus(statusCode: number): LinkInfo['status'] {
  switch (statusCode) {
    case LINK_STATUS.NORMAL: return 'normal';
    case LINK_STATUS.OUT_OF_DATE: return 'out-of-date';
    case LINK_STATUS.MISSING: return 'missing';
    case LINK_STATUS.EMBEDDED: return 'embedded';
    case LINK_STATUS.INACCESSIBLE: return 'inaccessible';
    default: return 'missing';
  }
}

export function getDocumentLinks(filePath: string): DocumentInfo {
  if (!app) throw new Error('Not connected to InDesign');

  const originalLevel = app.ScriptPreferences.UserInteractionLevel;
  app.ScriptPreferences.UserInteractionLevel = INTERACTION_LEVEL.NEVER_INTERACT;

  try {
    // Check if document is already open
    let doc: any = null;
    const docCount = app.Documents.Count;
    for (let i = 0; i < docCount; i++) {
      const d = app.Documents.Item(i);
      if (String(d.FilePath).toLowerCase() === filePath.toLowerCase()) {
        doc = d;
        break;
      }
    }

    if (!doc) {
      doc = app.Open(filePath, true);
    }

    const links: LinkInfo[] = [];
    const linkCount = doc.Links.Count;

    for (let i = 0; i < linkCount; i++) {
      try {
        const link = doc.Links.Item(i);
        const linkFilePath = String(link.FilePath);
        links.push({
          name: String(link.Name),
          filePath: linkFilePath === 'unknown' ? '' : linkFilePath,
          status: mapLinkStatus(Number(link.LinkStatus)),
        });
      } catch {
        // Skip inaccessible links
      }
    }

    return {
      name: String(doc.Name),
      path: filePath,
      links,
    };
  } finally {
    app.ScriptPreferences.UserInteractionLevel = originalLevel;
  }
}

export function relinkAndSave(
  filePath: string,
  linkName: string,
  newPath: string
): void {
  if (!app) throw new Error('Not connected to InDesign');

  const originalLevel = app.ScriptPreferences.UserInteractionLevel;
  app.ScriptPreferences.UserInteractionLevel = INTERACTION_LEVEL.NEVER_INTERACT;

  try {
    // Find the document (may already be open)
    let doc: any = null;
    const count = app.Documents.Count;
    for (let i = 0; i < count; i++) {
      const d = app.Documents.Item(i);
      if (String(d.FilePath).toLowerCase() === filePath.toLowerCase()) {
        doc = d;
        break;
      }
    }
    if (!doc) {
      doc = app.Open(filePath, true);
    }

    // Find and relink
    const linkCount = doc.Links.Count;
    for (let i = 0; i < linkCount; i++) {
      const link = doc.Links.Item(i);
      if (String(link.Name) === linkName) {
        try {
          const fso = ensureBridge().createObject('Scripting.FileSystemObject');
          const fileObj = fso.GetFile(newPath);
          link.Relink(fileObj);
        } catch {
          // Fallback: pass string path directly
          link.Relink(newPath);
        }
        break;
      }
    }

    doc.Save();
  } finally {
    app.ScriptPreferences.UserInteractionLevel = originalLevel;
  }
}

export function disconnect(): void {
  app = null;
}
