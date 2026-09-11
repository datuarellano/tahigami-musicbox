// WebSerial link to a running Music Box: the "!"-prefixed line protocol for
// reading/writing config, plus the 134-baud poke that reboots the board into
// the HalfKay bootloader (works even on firmware that predates !BOOTLOADER).
import { sleep, parseKV } from './util.js';

// USB_MIDI_AUDIO_SERIAL composite PID. Shared by every Teensy built this way,
// so it only narrows the chooser — the !VERSION handshake is what identifies
// the device.
export const D1_SERIAL_FILTERS = [{ usbVendorId: 0x16c0, usbProductId: 0x048a }];

export class MusicBoxSerial {
  constructor(port) {
    this.port = port || null;
    this._reader = null;
    this._pipeDone = null;
    this._buf = '';
    this._waiters = new Set();
  }

  static supported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async request() {
    this.port = await navigator.serial.requestPort({ filters: D1_SERIAL_FILTERS });
  }

  async open(baudRate = 115200) {
    await this.port.open({ baudRate });
    if (baudRate === 115200) this._startReading();
  }

  _startReading() {
    const decoder = new TextDecoderStream();
    this._pipeDone = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this._reader = decoder.readable.getReader();
    (async () => {
      try {
        for (;;) {
          const { value, done } = await this._reader.read();
          if (done) break;
          this._buf += value;
          let m;
          while ((m = this._buf.match(/\r?\n/))) {
            const line = this._buf.slice(0, m.index);
            this._buf = this._buf.slice(m.index + m[0].length);
            if (line.startsWith('!')) for (const w of this._waiters) w(line);
          }
        }
      } catch {
        /* reader cancelled on close */
      }
    })();
  }

  _waitFor(predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
      const w = (line) => {
        if (!predicate(line)) return;
        cleanup();
        resolve(line);
      };
      const t = setTimeout(() => {
        cleanup();
        reject(new Error('no reply from the device'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(t);
        this._waiters.delete(w);
      };
      this._waiters.add(w);
    });
  }

  async _write(text) {
    const w = this.port.writable.getWriter();
    try {
      await w.write(new TextEncoder().encode(text));
    } finally {
      w.releaseLock();
    }
  }

  async command(cmd, { expect, timeoutMs = 800, retries = 2 } = {}) {
    let err;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const reply = this._waitFor(expect, timeoutMs);
      await this._write(cmd + '\n');
      try {
        return await reply;
      } catch (e) {
        err = e;
      }
    }
    throw err || new Error('no reply');
  }

  // Returns { legacy:false, fw, proto, ... } | { legacy:true, reason } | null
  async handshake() {
    // Complete any half-line left in the firmware's line buffer by a previous
    // session, then let the ~10 Hz status-print firehose settle so our reply
    // isn't buried behind a burst of prose.
    try {
      await this._write('\n');
    } catch {
      /* ignore */
    }
    await sleep(400);

    // Primary probe: !VERSION (ungated in firmware). Generous window/retries -
    // Serial.print() on the device blocks up to ~120 ms when the USB TX buffer
    // is congested.
    try {
      const line = await this.command('!VERSION', {
        expect: (l) => l.startsWith('!VERSION ') || l === '!ERR unknown_command VERSION',
        timeoutMs: 1200,
        retries: 3,
      });
      if (line.startsWith('!VERSION ')) {
        const kv = parseKV(line.slice('!VERSION '.length));
        await this.setQuiet(true);
        return { legacy: false, proto: Number(kv.proto || 0), ...kv };
      }
      return { legacy: true, reason: 'no-version-command' };
    } catch {
      /* fall through to the !STATUS fallback */
    }

    // Fallback: !STATUS. New firmware appends fw=/proto= to this line too, so a
    // missed !VERSION window is NOT proof the unit is old.
    try {
      const status = await this.command('!GET_STATUS', {
        expect: (l) => l.startsWith('!STATUS'),
        timeoutMs: 2000,
        retries: 2,
      });
      const kv = parseKV(status.replace(/^!STATUS\s*/, ''));
      if (kv.fw) {
        await this.setQuiet(true);
        return { legacy: false, proto: Number(kv.proto || 0), fw: kv.fw, viaStatus: true, ...kv };
      }
      return { legacy: true, reason: 'status-no-version' };
    } catch {
      return null;
    }
  }

  // Silence the device's periodic status-print firehose for the session.
  // Best-effort: older firmware answers !ERR and we simply move on.
  async setQuiet(on) {
    try {
      await this.command(`!QUIET ${on ? 1 : 0}`, {
        expect: (l) => l.startsWith('!OK quiet=') || l.startsWith('!ERR '),
        timeoutMs: 600,
        retries: 1,
      });
    } catch {
      /* ignore */
    }
  }

  async getConfig() {
    const line = await this.command('!CFG_GET', {
      expect: (l) => l.startsWith('!CFG '),
      timeoutMs: 1000,
    });
    return parseKV(line.slice('!CFG '.length));
  }

  async setRegenMinutes(minutes) {
    const line = await this.command(`!CFG_SET regen_min ${minutes}`, {
      expect: (l) => l.startsWith('!OK cfg regen_min=') || l.startsWith('!ERR '),
      timeoutMs: 1000,
    });
    if (line.startsWith('!ERR ')) throw new Error(line.slice(5));
    return line;
  }

  async saveConfig() {
    const line = await this.command('!CFG_SAVE', {
      expect: (l) => l.startsWith('!OK cfg_save') || l.startsWith('!ERR '),
      timeoutMs: 3000,
    });
    if (line.startsWith('!ERR ')) throw new Error(line.slice(5));
    return line.trim();
  }

  // Immediate graceful apply of a staged interval (full fade + re-roll).
  async regenerateNow() {
    return this.command('!REGEN', {
      expect: (l) => l.startsWith('!OK regen'),
      timeoutMs: 2000,
    });
  }

  // Ask the running firmware (proto >= 2) to jump to HalfKay. Fire-and-forget:
  // the command still reboots the board even if its !OK reply is lost to a
  // congested TX buffer, so a missed ack is NOT a reason to bail.
  async requestBootloaderCommand() {
    try {
      await this.command('!BOOTLOADER', {
        expect: (l) => l.startsWith('!OK bootloader'),
        timeoutMs: 800,
        retries: 0,
      });
    } catch {
      /* ack lost — the firmware still reboots on its own timer */
    }
    await this.close({ restoreVerbosity: false });
  }

  // Legacy fallback: a 134-baud open the Teensy core traps in its endpoint-0
  // ISR. Known to be unreliable on some OS/browser combinations.
  async pokeBootloader() {
    await this._poke134();
  }

  async _poke134() {
    await this.close();
    await this.port.open({ baudRate: 134 });
    await sleep(300);
    await this.port.close();
  }

  async close({ restoreVerbosity = true } = {}) {
    try {
      if (restoreVerbosity && this.port?.writable && !this.port.writable.locked) {
        await this.setQuiet(false);
      }
    } catch {
      /* ignore */
    }
    try {
      await this._reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      this._reader?.releaseLock();
    } catch {
      /* ignore */
    }
    try {
      await this._pipeDone;
    } catch {
      /* ignore */
    }
    try {
      await this.port?.close();
    } catch {
      /* ignore */
    }
    this._reader = null;
    this._pipeDone = null;
    this._buf = '';
  }
}
