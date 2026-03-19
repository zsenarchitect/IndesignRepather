export interface Mapping {
  oldPath: string;
  newPath: string;
}

export interface LinkInfo {
  name: string;
  filePath: string;
  status: 'normal' | 'missing' | 'out-of-date' | 'embedded' | 'inaccessible';
  thumbnailPath?: string;
  newPath?: string;
  newPathExists?: boolean;
}

export interface DocumentInfo {
  name: string;
  path: string;
  links: LinkInfo[];
}

export interface RepathResult {
  document: string;
  totalLinks: number;
  repathedLinks: number;
  failedLinks: number;
  errors: string[];
}

export interface ProgressUpdate {
  stage: 'analyzing' | 'discovering' | 'repathing';
  currentFile: string;
  currentFileIndex: number;
  totalFiles: number;
  currentLink?: number;
  totalLinks?: number;
}

// InDesign COM status codes (Adobe's official 32-bit integer constants)
export const LINK_STATUS = {
  NORMAL: 1852797549,
  OUT_OF_DATE: 1819242340,
  MISSING: 1819109747,
  EMBEDDED: 1282237028,
  INACCESSIBLE: 1818848865,
} as const;

export const INTERACTION_LEVEL = {
  NEVER_INTERACT: 1852403060,
  INTERACT_WITH_ALL: 1852403553,
} as const;
