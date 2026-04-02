/**
 * Fire-and-forget error reporter for ErrorDump.
 * Posts errors to the centralized ErrorDump ingest API.
 * Never throws — failures are silently swallowed so the app is unaffected.
 *
 * Runs in the Electron main process only. The renderer reports errors
 * via the 'report-error' IPC handler exposed in preload.ts.
 *
 * 2026-04-01: Created — replaces dead Sentry integration.
 */

import { app } from 'electron';
import * as os from 'os';

const SOURCE_APP = 'indesign-repather';
const INGEST_URL =
  'https://error-dump-ennead-projects.vercel.app/error-dump/api/ingest';

// Client-side rate limiting: max 10 reports per minute
let reportCount = 0;
let windowStart = Date.now();
const MAX_REPORTS_PER_MINUTE = 10;

export interface ErrorReportOpts {
  error_message: string;
  stack_trace?: string;
  function_name?: string;
  context?: Record<string, unknown>;
}

/**
 * Report an error to ErrorDump. Fire-and-forget — never blocks, never throws.
 */
export function reportError(opts: ErrorReportOpts): void {
  // Rate limiting
  const now = Date.now();
  if (now - windowStart > 60_000) {
    reportCount = 0;
    windowStart = now;
  }
  if (reportCount >= MAX_REPORTS_PER_MINUTE) return;
  reportCount++;

  const body = {
    source_app: SOURCE_APP,
    environment: app.isPackaged ? 'production' : 'development',
    error_message: opts.error_message.slice(0, 5000),
    stack_trace: opts.stack_trace?.slice(0, 10_000) ?? '',
    function_name: opts.function_name ?? '',
    user_name: os.userInfo().username,
    machine_name: os.hostname(),
    context: {
      app_version: app.getVersion(),
      platform: process.platform,
      ...(opts.context ?? {}),
    },
  };

  fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Swallow — error reporting must never crash the app
  });
}
