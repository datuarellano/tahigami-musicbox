// Small shared helpers for the updater. No dependencies.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "a=1 b=two c=3" -> { a: "1", b: "two", c: "3" }  (values never contain spaces;
// unknown keys are simply carried through - the firmware's parser contract).
export function parseKV(str) {
  const out = {};
  for (const tok of str.trim().split(/\s+/)) {
    const eq = tok.indexOf('=');
    if (eq > 0) out[tok.slice(0, eq)] = tok.slice(eq + 1);
  }
  return out;
}

// "0a0b0c" -> Uint8Array([10, 11, 12])
export function hexToBytes(s) {
  if (s.length % 2) throw new Error('odd-length hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(s.substr(i * 2, 2), 16);
    if (Number.isNaN(b)) throw new Error('bad hex digit');
    out[i] = b;
  }
  return out;
}

export function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// True if data[offset .. offset+len) is entirely 0xFF (an erased/blank block).
export function isBlank(data, offset, len) {
  for (let i = offset; i < offset + len; i++) if (data[i] !== 0xff) return false;
  return true;
}

// Run fn(), retrying up to `tries` times with `delayMs` between attempts.
export async function withRetry(fn, tries, delayMs) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(delayMs);
    }
  }
  throw lastErr;
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
