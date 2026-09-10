// Firmware release manifest: fetch, pick latest, download + verify a .hex.
// Hosted same-origin (public/firmware/) so there is no CORS to worry about.
import { bytesToHex } from './util.js';

const BASE = import.meta.env.BASE_URL || '/';
const MANIFEST_URL = `${BASE}firmware/manifest.json`;

export async function fetchManifest() {
  const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load the firmware list (HTTP ${res.status}).`);
  const m = await res.json();
  if (!m || !Array.isArray(m.releases) || m.releases.length === 0) {
    throw new Error('The firmware list is empty or malformed.');
  }
  return m;
}

export function pickLatest(manifest) {
  return (
    manifest.releases.find((r) => r.version === manifest.latest) || manifest.releases[0]
  );
}

// Returns the raw Intel-HEX text, only after the SHA-256 matches the manifest.
export async function downloadFirmware(release) {
  const url = /^https?:\/\//.test(release.file)
    ? release.file
    : `${BASE}${String(release.file).replace(/^\/+/, '')}`;

  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Firmware download failed (HTTP ${res.status}).`);
  const text = await res.text();

  if (release.sha256) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const got = bytesToHex(digest).toLowerCase();
    if (got !== String(release.sha256).toLowerCase()) {
      throw new Error('Firmware checksum did not match — download aborted, nothing was written.');
    }
  }
  return text;
}
