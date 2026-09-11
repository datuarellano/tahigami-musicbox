// Teensy 4.0 (i.MX RT1062) HalfKay bootloader flashing over WebHID.
// Protocol mirrors PJRC's teensy_loader_cli:
//   - HID device VID 0x16C0 / PID 0x0478
//   - 1024-byte blocks, 1088-byte reports (24-bit LE addr in [0..2], 61 zero
//     bytes, then 1024 data bytes at offset 64), report ID 0
//   - block 0 is ALWAYS written (that write triggers the full chip erase);
//     every later block is skipped when it holds no data / is all 0xFF
//   - a final report of 0xFF 0xFF 0xFF reboots the board
import { hexToBytes, isBlank, withRetry, sleep } from './util.js';

export const HALFKAY_FILTER = { vendorId: 0x16c0, productId: 0x0478 };

const FLASH_BASE = 0x60000000; // Teensy 4.0 program flash origin
const CODE_SIZE = 2031616;
const BLOCK = 1024;
const REPORT = 1088;

// ---- Intel HEX -----------------------------------------------------------------

// Parse Intel HEX text into a full flash image plus a per-block "has data" map.
export function parseIntelHex(text) {
  const data = new Uint8Array(CODE_SIZE).fill(0xff);
  const hasData = new Uint8Array(Math.ceil(CODE_SIZE / BLOCK));
  let upperBase = 0;
  let seenData = false;

  const lines = text.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error(`HEX line ${n + 1}: missing ':'`);

    const raw = hexToBytes(line.slice(1));
    if (raw.length < 5) throw new Error(`HEX line ${n + 1}: truncated`);
    const len = raw[0];
    const addr16 = (raw[1] << 8) | raw[2];
    const type = raw[3];
    if (raw.length !== 5 + len) throw new Error(`HEX line ${n + 1}: length mismatch`);

    let sum = 0;
    for (let i = 0; i < raw.length; i++) sum = (sum + raw[i]) & 0xff;
    if (sum !== 0) throw new Error(`HEX line ${n + 1}: bad checksum`);

    const payload = raw.subarray(4, 4 + len);

    switch (type) {
      case 0x00: {
        // data
        const absolute = (upperBase + addr16) >>> 0;
        const offset = absolute - FLASH_BASE;
        if (offset < 0 || offset + len > CODE_SIZE) {
          throw new Error(
            `HEX line ${n + 1}: address 0x${absolute.toString(16)} is outside the Teensy 4.0 flash`
          );
        }
        data.set(payload, offset);
        for (
          let b = Math.floor(offset / BLOCK);
          b <= Math.floor((offset + len - 1) / BLOCK);
          b++
        ) {
          hasData[b] = 1;
        }
        seenData = true;
        break;
      }
      case 0x01: // EOF
        n = lines.length;
        break;
      case 0x02: // extended segment address
        upperBase = (((payload[0] << 8) | payload[1]) << 4) >>> 0;
        break;
      case 0x04: // extended linear address
        upperBase = (((payload[0] << 8) | payload[1]) << 16) >>> 0;
        break;
      case 0x03: // start segment address  — informational
      case 0x05: // start linear address   — informational
        break;
      default:
        throw new Error(`HEX line ${n + 1}: unsupported record type 0x${type.toString(16)}`);
    }
  }

  if (!seenData) throw new Error('This file has no program data.');
  return { data, hasData };
}

// ---- flashing ---------------------------------------------------------------

function sendReportTimed(device, reportId, buffer, ms) {
  return Promise.race([
    device.sendReport(reportId, buffer),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('the device stopped responding (HID write timed out)')), ms)
    ),
  ]);
}

// Flash a parsed image. Calls onProgress(done, total) and log(msg) as it goes.
export async function flashImage(device, image, { onProgress, log } = {}) {
  if (!device.opened) await device.open();

  let total = 1; // block 0 always counts
  for (let b = 1; b < image.hasData.length; b++) {
    if (image.hasData[b] && !isBlank(image.data, b * BLOCK, BLOCK)) total++;
  }

  let done = 0;
  for (let addr = 0; addr < CODE_SIZE; addr += BLOCK) {
    const block = addr / BLOCK;
    if (block > 0) {
      if (!image.hasData[block]) continue;
      if (isBlank(image.data, addr, BLOCK)) continue;
    }

    const report = new Uint8Array(REPORT);
    report[0] = addr & 0xff;
    report[1] = (addr >> 8) & 0xff;
    report[2] = (addr >> 16) & 0xff;
    report.set(image.data.subarray(addr, addr + BLOCK), 64);

    if (block === 0) {
      log?.('Erasing the old firmware — this takes a few seconds, please don\u2019t unplug it…');
      await withRetry(() => sendReportTimed(device, 0, report, 20000), 5, 2000);
      await sleep(3000); // let the erase settle before the next write
    } else {
      await withRetry(() => sendReportTimed(device, 0, report, 3000), 3, 500);
    }

    done++;
    onProgress?.(done, total);
  }

  const reboot = new Uint8Array(REPORT);
  reboot[0] = reboot[1] = reboot[2] = 0xff;
  try {
    await sendReportTimed(device, 0, reboot, 2000);
  } catch {
    // the board often drops off the bus before this resolves — that's fine
  }
  log?.('Firmware written. The Music Box is restarting.');
}
