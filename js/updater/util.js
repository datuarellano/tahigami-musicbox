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

// Turn a raw browser/DOM exception or a firmware "!ERR <token>..." string into
// something an owner (not a developer) can act on. Anything we already wrote
// ourselves in plain English (manifest.js, halfkay.js) passes through as-is.
export function friendlyError(e) {
  const msg = String(e?.message ?? e ?? '').trim();

  if (/already open/i.test(msg)) return 'Already connected.';
  if (/no port selected|no device selected/i.test(msg)) return 'No device was selected.';
  if (/user gesture/i.test(msg)) return 'Click the button again to select the device.';
  if (/device has been lost|device not found|failed to open/i.test(msg)) {
    return 'Could not reach the device. Check the USB cable and try again.';
  }
  if (/no reply from the device/i.test(msg)) {
    return 'The Music Box didn\u2019t respond. Make sure no other app or browser tab is ' +
      'already connected to it, then try again.';
  }

  // Firmware "!ERR ..." tokens (src/debug_helper.cpp, src/music_box_config.cpp).
  const range = msg.match(/^out_of_range \S+ \S+ valid=(\d+)-(\d+)/);
  if (range) return `Enter a value between ${range[1]} and ${range[2]}.`;
  if (/^not_a_number/.test(msg)) return 'Enter a whole number.';
  if (/^unknown_cfg_key/.test(msg)) return 'This firmware doesn\u2019t recognize that setting.';
  if (/^bpm_min_above_max|^bpm_max_below_min/.test(msg)) {
    return 'The slowest tempo can\u2019t be faster than the fastest one \u2014 check the two values.';
  }
  if (/^unknown_command/.test(msg)) return 'This firmware doesn\u2019t support that action yet.';
  if (/^cfg_save_busy/.test(msg)) {
    return 'The Music Box is in the middle of fading out \u2014 wait a moment and try saving again.';
  }
  if (/^cfg_save_too_soon/.test(msg)) {
    return 'You just saved \u2014 wait a couple of seconds and try again.';
  }
  if (/^cfg_save_failed/.test(msg)) return 'Couldn\u2019t confirm the save. Try again.';

  return msg || 'Something went wrong. Please try again.';
}
