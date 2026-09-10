// Tahigami Music Box — web updater / configurator.
// Two independent tools on one page:
//   • Timer      — read/write the regeneration interval over WebSerial
//   • Firmware   — reboot to HalfKay (WebSerial poke) and flash over WebHID
import { MusicBoxSerial } from './serial.js';
import { HALFKAY_FILTER, parseIntelHex, flashImage } from './halfkay.js';
import { fetchManifest, pickLatest, downloadFirmware } from './manifest.js';
import { compareVersions, sleep } from './util.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => el && el.toggleAttribute('hidden', !on);
const CFG_STORE = 'tahigami.updater.cfg'; // { [sn]: { regen_min, savedAt } }

const state = {
  serial: null,
  device: null, // { legacy, proto, fw, sn, ... }
  hid: null,
  manifest: null,
  latest: null,
};

// ---------------------------------------------------------------------------
// capability gate
// ---------------------------------------------------------------------------
function gate() {
  const hasSerial = 'serial' in navigator;
  const hasHid = 'hid' in navigator;
  const banner = $('gate');
  const timerCard = $('timer-card');
  const fwCard = $('firmware-card');

  if (hasSerial && hasHid) {
    show(banner, false);
    return true;
  }
  if (hasSerial && !hasHid) {
    banner.className = 'gate gate-warn';
    banner.innerHTML =
      '<strong>Partial support.</strong> You can change the timer in this browser, ' +
      'but firmware updates need Chrome or Edge on desktop.';
    show(banner, true);
    $('firmware-disabled').textContent =
      'Firmware updates need Chrome or Edge on desktop (this browser has no WebHID).';
    show($('firmware-disabled'), true);
    fwCard.classList.add('is-disabled');
    return true;
  }
  // no serial at all — Safari, Firefox mobile, etc.
  banner.className = 'gate gate-stop';
  banner.innerHTML =
    '<strong>This browser can’t talk to the Music Box.</strong> ' +
    'Open this page in <b>Chrome</b> or <b>Edge</b> on a desktop computer, then plug the ' +
    'device in with a USB cable. ' +
    '<button type="button" id="copy-link" class="link-btn">Copy this link</button>';
  show(banner, true);
  timerCard.classList.add('is-disabled');
  fwCard.classList.add('is-disabled');
  $('copy-link')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('copy-link').textContent = 'Link copied';
    } catch {
      /* clipboard blocked — no-op */
    }
  });
  return false;
}

// ---------------------------------------------------------------------------
// config stash (keyed by device serial) — lets us re-apply a setting a
// firmware update might have reset, without special-casing the flash flow
// ---------------------------------------------------------------------------
function readStash() {
  try {
    return JSON.parse(localStorage.getItem(CFG_STORE) || '{}');
  } catch {
    return {};
  }
}
function stashConfig(sn, regenMin) {
  if (!sn) return;
  try {
    const all = readStash();
    all[sn] = { regen_min: Number(regenMin), savedAt: Date.now() };
    localStorage.setItem(CFG_STORE, JSON.stringify(all));
  } catch {
    /* storage unavailable — fine */
  }
}

// ---------------------------------------------------------------------------
// Timer tool
// ---------------------------------------------------------------------------
function setTimerStatus(msg, kind = '') {
  const el = $('timer-status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}

async function connectSerial() {
  const s = new MusicBoxSerial();
  try {
    await s.request();
  } catch {
    return; // user dismissed the chooser
  }
  $('timer-connect').disabled = true;
  setTimerStatus('Connecting…');
  try {
    await s.open(115200);
    const info = await s.handshake();
    if (!info) {
      await s.close();
      setTimerStatus(
        'No response. Close any other app using the device (Soundlab, a serial monitor) and try again.',
        'err'
      );
      $('timer-connect').disabled = false;
      return;
    }
    state.serial = s;
    state.device = info;

    if (info.legacy) {
      setTimerStatus(
        'Connected. This unit runs older firmware — update it below to unlock the timer setting.',
        'warn'
      );
      show($('timer-form'), false);
      reflectFirmware();
      return;
    }

    await loadConfigIntoForm();
    reflectFirmware();
  } catch (e) {
    await s.close().catch(() => {});
    setTimerStatus(`Could not connect: ${e.message}`, 'err');
    $('timer-connect').disabled = false;
  }
}

async function loadConfigIntoForm() {
  const cfg = await state.serial.getConfig();
  const cur = Number(cfg.regen_min);
  const active = Number(cfg.regen_min_active);
  $('regen-input').value = String(cur);
  $('regen-range').value = String(Math.min(120, Math.max(5, cur)));
  state.device.cfg = cfg;

  show($('timer-form'), true);
  $('timer-connect').textContent = 'Reconnect';
  $('timer-connect').disabled = false;

  // Offer to restore a value this device had before (e.g. lost to a downgrade).
  const stash = readStash()[state.device.sn];
  const applyNowRow = $('apply-now-row');
  show(applyNowRow, cur !== active);
  $('active-note').textContent =
    cur !== active ? `Currently running a ${active}-minute cycle until the next regeneration.` : '';

  const restoreRow = $('restore-row');
  if (stash && stash.regen_min && stash.regen_min !== cur) {
    $('restore-btn').textContent = `Restore your saved ${stash.regen_min} min`;
    $('restore-btn').dataset.value = String(stash.regen_min);
    show(restoreRow, true);
  } else {
    show(restoreRow, false);
  }

  setTimerStatus(
    `Connected to firmware ${state.device.fw || '?'}. Current setting: ${cur} minutes.`,
    'ok'
  );
}

function syncFromRange() {
  $('regen-input').value = $('regen-range').value;
}
function syncFromInput() {
  const v = Math.min(240, Math.max(1, Number($('regen-input').value) || 40));
  $('regen-range').value = String(Math.min(120, Math.max(5, v)));
}

async function saveTimer() {
  const minutes = Math.min(240, Math.max(1, Number($('regen-input').value) || 40));
  $('timer-save').disabled = true;
  setTimerStatus('Saving…');
  try {
    await state.serial.setRegenMinutes(minutes);
    const res = await state.serial.saveConfig();
    stashConfig(state.device.sn, minutes);
    await loadConfigIntoForm();
    setTimerStatus(
      res.includes('unchanged')
        ? 'Already saved — nothing changed.'
        : `Saved. New cycle length: ${minutes} minutes (applies at the next regeneration).`,
      'ok'
    );
  } catch (e) {
    setTimerStatus(`Save failed: ${e.message}`, 'err');
  } finally {
    $('timer-save').disabled = false;
  }
}

async function applyNow() {
  $('apply-now').disabled = true;
  try {
    await state.serial.regenerateNow();
    await loadConfigIntoForm();
    setTimerStatus('Applied — the Music Box is starting a fresh cycle now.', 'ok');
  } catch (e) {
    setTimerStatus(`Could not apply now: ${e.message}`, 'err');
  } finally {
    $('apply-now').disabled = false;
  }
}

async function restoreStashed(ev) {
  const v = Number(ev.currentTarget.dataset.value);
  if (!v) return;
  $('regen-input').value = String(v);
  await saveTimer();
}

// ---------------------------------------------------------------------------
// Firmware tool
// ---------------------------------------------------------------------------
function setFwStatus(msg, kind = '') {
  const el = $('fw-status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}
function fwLog(msg) {
  const el = $('fw-log');
  el.hidden = false;
  el.textContent = msg;
}

async function loadManifest() {
  try {
    state.manifest = await fetchManifest();
    state.latest = pickLatest(state.manifest);
    $('fw-latest').textContent = `Latest firmware: ${state.latest.version}`;
    if (state.latest.notes) $('fw-notes').textContent = state.latest.notes;
    reflectFirmware();
  } catch (e) {
    $('fw-latest').textContent = e.message;
  }
}

// Reconcile the "what's installed vs available" line and button state.
function reflectFirmware() {
  const cur = state.device && !state.device.legacy ? state.device.fw : null;
  const line = $('fw-current');
  if (state.device?.legacy) {
    line.textContent = 'Installed: older firmware (no version reported).';
  } else if (cur) {
    line.textContent = `Installed: ${cur}`;
  } else {
    line.textContent = 'Connect the Music Box (Timer tool above) to see its installed version.';
  }

  const canFlash = 'hid' in navigator && !!state.latest;
  const upToDate =
    cur && state.latest && compareVersions(cur, state.latest.version) >= 0 && !state.device?.legacy;
  $('fw-start').disabled = !canFlash;
  $('fw-start').textContent = upToDate ? 'Reinstall current firmware' : 'Update firmware';
  show($('fw-uptodate'), !!upToDate);
}

// Step 1 — reboot the running board into HalfKay, then wait for the HID device.
async function prepareDevice() {
  $('fw-start').disabled = true;
  setFwStatus('Putting the Music Box into update mode…');
  try {
    // Snapshot config first, so a wiped EEPROM can be restored afterwards.
    if (state.serial && state.device && !state.device.legacy) {
      try {
        const cfg = await state.serial.getConfig();
        stashConfig(state.device.sn, Number(cfg.regen_min));
      } catch {
        /* best effort */
      }
    }

    if (state.serial) {
      await state.serial.enterBootloader(state.device?.proto || 0);
      state.serial = null;
    } else {
      // No serial session — ask for the port just to send the 134-baud poke.
      const s = new MusicBoxSerial();
      try {
        await s.request();
        await s.open(115200);
        await s.enterBootloader(0);
      } catch {
        setFwStatus(
          'Need the Music Box selected once to reboot it. Click “Update firmware” again and pick the device.',
          'err'
        );
        $('fw-start').disabled = false;
        return;
      }
    }

    setFwStatus('Waiting for the bootloader… (a few seconds)');
    const dev = await waitForHalfKay(15000);
    state.hid = dev; // may be null on a first run (no prior HID permission)
    show($('fw-flash-row'), true);
    $('fw-flash').disabled = false;
    if (dev) {
      setFwStatus('Update mode ready.', 'ok');
    } else {
      setFwStatus(
        'The Music Box should now be in update mode (its light is off). Click “Flash firmware ' +
          'now” and choose it from the list. If nothing appears, unplug it, plug it back in, ' +
          'and try again.',
        'warn'
      );
    }
  } catch (e) {
    setFwStatus(`Couldn’t enter update mode: ${e.message}`, 'err');
    $('fw-start').disabled = false;
  }
}

async function waitForHalfKay(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  // Maybe we were already granted it on a previous visit.
  const known = (await navigator.hid.getDevices()).find(
    (d) => d.vendorId === HALFKAY_FILTER.vendorId && d.productId === HALFKAY_FILTER.productId
  );
  if (known) return known;

  return new Promise((resolve) => {
    const onConnect = (e) => {
      if (
        e.device.vendorId === HALFKAY_FILTER.vendorId &&
        e.device.productId === HALFKAY_FILTER.productId
      ) {
        cleanup();
        resolve(e.device);
      }
    };
    const poll = setInterval(async () => {
      const d = (await navigator.hid.getDevices()).find(
        (x) => x.vendorId === HALFKAY_FILTER.vendorId && x.productId === HALFKAY_FILTER.productId
      );
      if (d) {
        cleanup();
        resolve(d);
      } else if (Date.now() > deadline) {
        cleanup();
        resolve(null);
      }
    }, 500);
    const cleanup = () => {
      clearInterval(poll);
      navigator.hid.removeEventListener('connect', onConnect);
    };
    navigator.hid.addEventListener('connect', onConnect);
  });
}

// Step 2 — pick the HID device (if needed) and write the firmware.
async function flashFirmware() {
  $('fw-flash').disabled = true;
  const bar = $('fw-progress');
  show(bar, true);
  bar.value = 0;

  try {
    let device = state.hid;
    if (!device) {
      const picked = await navigator.hid.requestDevice({ filters: [HALFKAY_FILTER] });
      device = picked[0];
    }
    if (!device) {
      setFwStatus('No bootloader device selected.', 'err');
      $('fw-flash').disabled = false;
      return;
    }

    setFwStatus('Downloading and verifying firmware…');
    const hexText = await downloadFirmware(state.latest);
    const image = parseIntelHex(hexText);

    setFwStatus('Writing firmware — keep the cable connected.', '');
    await flashImage(device, image, {
      onProgress: (done, total) => {
        bar.max = total;
        bar.value = done;
      },
      log: fwLog,
    });

    setFwStatus(
      `Done. The Music Box is now running firmware ${state.latest.version}.`,
      'ok'
    );
    show($('fw-post'), true);
  } catch (e) {
    setFwStatus(`Update failed: ${e.message}`, 'err');
    fwLog(
      'If the device is still in update mode you can retry. Otherwise unplug it, plug it ' +
        'back in, and start again.'
    );
    $('fw-flash').disabled = false;
  }
}

async function reconnectAndRestore() {
  const s = new MusicBoxSerial();
  try {
    await s.request();
    await s.open(115200);
    const info = await s.handshake();
    if (!info || info.legacy) {
      await s.close();
      return;
    }
    const stash = readStash()[info.sn];
    if (stash && stash.regen_min) {
      await s.setRegenMinutes(stash.regen_min);
      await s.saveConfig();
    }
    state.serial = s;
    state.device = info;
    await loadConfigIntoForm();
    $('fw-post').hidden = true;
    setTimerStatus(`Reconnected. Timer restored to ${stash?.regen_min ?? '(default)'} minutes.`, 'ok');
  } catch {
    await s.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
function wire() {
  $('timer-connect')?.addEventListener('click', connectSerial);
  $('regen-range')?.addEventListener('input', syncFromRange);
  $('regen-input')?.addEventListener('input', syncFromInput);
  $('timer-save')?.addEventListener('click', saveTimer);
  $('apply-now')?.addEventListener('click', applyNow);
  $('restore-btn')?.addEventListener('click', restoreStashed);
  $('fw-start')?.addEventListener('click', prepareDevice);
  $('fw-flash')?.addEventListener('click', flashFirmware);
  $('fw-reconnect')?.addEventListener('click', reconnectAndRestore);
}

if (gate()) {
  wire();
  loadManifest();
} else {
  wire(); // still wire the copy-link button
}
