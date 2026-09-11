// Tahigami Music Box — web updater / configurator.
// Three tabs sharing one connection:
//   • Status    — connect over WebSerial, see what's installed
//   • Firmware  — compare versions, flash (or roll back) over WebHID
//   • Config    — read/write settings over WebSerial (locked until connected
//                 on firmware that supports it)
import { MusicBoxSerial } from './serial.js';
import { HALFKAY_FILTER, parseIntelHex, flashImage } from './halfkay.js';
import { fetchManifest, pickLatest, downloadFirmware } from './manifest.js';
import { compareVersions, friendlyError } from './util.js';
import { modalAlert, modalConfirm, modalPrompt } from './modal.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => el && el.toggleAttribute('hidden', !on);
const CFG_STORE = 'tahigami.updater.cfg'; // { [sn]: { regen_min, savedAt } }

const state = {
  serial: null,
  device: null, // { legacy, proto, fw, sn, ... }
  manifest: null,
  latest: null,
  fwImages: {}, // version -> parsed HalfKay image, cached per version
};

// ---------------------------------------------------------------------------
// tabs
// ---------------------------------------------------------------------------
const TABS = ['status', 'firmware', 'config'];

function switchTab(name) {
  for (const t of TABS) {
    const active = t === name;
    show($(`tab-${t}`), active);
    $(`tab-btn-${t}`).classList.toggle('is-active', active);
    $(`tab-btn-${t}`).setAttribute('aria-selected', String(active));
  }
}

// ---------------------------------------------------------------------------
// capability gate
// ---------------------------------------------------------------------------
function gate() {
  const hasSerial = 'serial' in navigator;
  const hasHid = 'hid' in navigator;
  const banner = $('gate');

  if (hasSerial && hasHid) {
    show(banner, false);
    return true;
  }
  if (hasSerial && !hasHid) {
    banner.className = 'gate gate-warn';
    banner.innerHTML =
      '<strong>Almost there.</strong> Status and Config work in this browser, but updating ' +
      'firmware needs Chrome or Edge on a computer.';
    show(banner, true);
    $('fw-browser-note').textContent =
      'Updating firmware needs Chrome or Edge on a computer — this browser can\u2019t do it.';
    show($('fw-browser-note'), true);
    $('tab-firmware').classList.add('is-disabled');
    return true;
  }
  // no serial at all — Safari, Firefox mobile, etc.
  banner.className = 'gate gate-stop';
  banner.innerHTML =
    '<strong>This browser can’t talk to the Music Box.</strong> ' +
    'Please open this page in <b>Chrome</b> or <b>Edge</b> on a computer, then plug the ' +
    'Music Box in with a USB cable. ' +
    '<button type="button" id="copy-link" class="link-btn">Copy this link</button>';
  show(banner, true);
  $('tab-status').classList.add('is-disabled');
  $('tab-firmware').classList.add('is-disabled');
  $('tab-config').classList.add('is-disabled');
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
function stashConfig(sn, values) {
  sn = sn || 'default';
  try {
    const all = readStash();
    // Merge rather than replace: the three settings save independently, so
    // saving just the timer shouldn't forget a previously-stashed volume cap.
    all[sn] = { ...(all[sn] || {}), ...values, savedAt: Date.now() };
    localStorage.setItem(CFG_STORE, JSON.stringify(all));
  } catch {
    /* storage unavailable — fine */
  }
}

// ---------------------------------------------------------------------------
// connection state — one source of truth, reflected into all three tabs
// ---------------------------------------------------------------------------
function setConnDot(mode) {
  $('conn-dot').className = `conn-dot conn-dot-${mode}`;
}

function setConnStatus(msg, kind = '') {
  const el = $('conn-status');
  el.textContent = msg;
  el.className = `status ${kind}`;
}

let heartbeatTimer = null;
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(async () => {
    if (!state.serial) return stopHeartbeat();
    try {
      await state.serial.command('!GET_STATUS', {
        expect: (l) => l.startsWith('!STATUS'),
        timeoutMs: 1500,
        retries: 0,
      });
    } catch {
      stopHeartbeat();
      markSerialDisconnected('Connection lost — check the USB cable.', 'err');
    }
  }, 4000);
}
function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function markSerialDisconnected(msg, kind = 'warn') {
  const s = state.serial;
  state.serial = null;
  stopHeartbeat();
  // Actually release the port — otherwise the browser still considers it
  // open, and the next "Connect" click fails with "already open" even
  // though the app itself has moved on.
  if (s) s.close().catch(() => {});
  if (msg) setConnStatus(msg, kind);
  renderConnectionState();
}

// Reconciles: Status tab (dot/text/device info), Firmware tab (installed
// version + badge + hint), Config tab (locked/unlocked + why).
function renderConnectionState() {
  const connected = !!state.serial && !!state.device;
  const legacy = connected && state.device.legacy;

  setConnDot(connected ? 'connected' : 'idle');
  $('conn-text').textContent = connected
    ? legacy
      ? 'Connected — older firmware'
      : 'Connected'
    : 'Not connected';
  $('connect-btn').textContent = connected ? 'Refresh' : 'Connect the Music Box';
  $('connect-btn').disabled = false;
  show($('device-info'), connected);
  if (connected) {
    $('info-fw').textContent = legacy ? 'unknown (pre-2.1.0)' : state.device.fw || '?';
    $('info-sn').textContent = state.device.sn || '—';
  }

  reflectFirmware();

  const locked = !connected || legacy;
  show($('config-locked'), locked);
  show($('config-unlocked'), !locked);
  if (!connected) {
    $('config-locked-msg').textContent = 'Connect the Music Box first to change its settings.';
    $('config-locked-cta').textContent = 'Go to Status';
    $('config-locked-cta').onclick = () => switchTab('status');
  } else if (legacy) {
    $('config-locked-msg').textContent =
      "This unit's firmware doesn't support the browser configurator yet.";
    $('config-locked-cta').textContent = 'Go to Firmware';
    $('config-locked-cta').onclick = () => switchTab('firmware');
  }
}

async function connectSerial() {
  resetFlashSession();
  const refreshing = !!state.serial;
  let s;
  if (state.serial) {
    // "Refresh" while already connected: drop the current session and
    // reopen the SAME physical port. Reusing the port object (rather than
    // requesting it again) avoids both a redundant chooser dialog and the
    // "port is already open" error a second open() on it would throw.
    stopHeartbeat();
    const port = state.serial.port;
    await state.serial.close().catch(() => {});
    state.serial = null;
    state.device = null;
    s = new MusicBoxSerial(port);
  } else {
    s = new MusicBoxSerial();
    try {
      await s.request();
    } catch {
      return; // user dismissed the chooser
    }
  }
  // The dot + label above the button are the one spinner for this — a
  // second one on the status line below just repeated the same news in
  // different, briefly-contradictory words ("Connected" next to
  // "Connecting…").
  $('connect-btn').disabled = true;
  setConnDot('connecting');
  $('conn-text').textContent = refreshing ? 'Refreshing…' : 'Connecting…';
  setConnStatus('');
  try {
    await s.open(115200);
    const info = await s.handshake();
    state.serial = s;
    state.device = info;
    renderConnectionState();

    if (info.legacy && info.reason === 'silent') {
      // This old a firmware never answers anything, including our "are you
      // still there?" check — polling it would just misreport a good
      // connection as lost every few seconds.
      setConnStatus(
        'Connected. This firmware is too old to check in on, so update it to unlock live status and the Config tab.',
        'warn'
      );
      return;
    }

    startHeartbeat();

    if (info.legacy) {
      setConnStatus('Connected. Update the firmware to unlock the Config tab.', 'warn');
      return;
    }

    await loadConfigIntoForm();
    setConnStatus(`Connected to firmware ${info.fw || '?'}.`, 'ok');
  } catch (e) {
    await s.close().catch(() => {});
    // The old session (if this was a refresh) was already closed above, so
    // there's nothing left to call "connected" — reflect that everywhere
    // (dot, label, device info, locked tabs) rather than leaving a stale
    // "Connected" behind a fresh error.
    state.serial = null;
    state.device = null;
    renderConnectionState();
    setConnStatus(`Could not connect: ${friendlyError(e)}`, 'err');
    $('connect-btn').disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Config tab — Timer
// ---------------------------------------------------------------------------
async function loadConfigIntoForm() {
  const cfg = await state.serial.getConfig();
  const cur = Number(cfg.regen_min);
  const active = Number(cfg.regen_min_active);
  $('regen-input').value = String(cur);
  $('regen-range').value = String(Math.min(120, Math.max(5, cur)));
  state.device.cfg = cfg;

  const applyNowRow = $('apply-now-row');
  show(applyNowRow, cur !== active);
  $('active-note').textContent =
    cur !== active
      ? `Still on the old ${active}-minute cycle for now \u2014 the new setting starts next time it refreshes.`
      : '';

  const stash = readStash()[state.device.sn || 'default'];
  const restoreRow = $('restore-row');
  if (stash && stash.regen_min && stash.regen_min !== cur) {
    $('restore-btn').textContent = `Restore your saved ${stash.regen_min} min`;
    $('restore-btn').dataset.value = String(stash.regen_min);
    show(restoreRow, true);
  } else {
    show(restoreRow, false);
  }

  // volume_cap / led_brightness only exist on schema >= 2 - a device running
  // an earlier 2.1.0 build (schema 1) is still fully "unlocked" but just
  // doesn't have these two keys yet.
  const hasNewKeys = Number(state.device.cfg_schema || 0) >= 2;
  show($('volcap-card'), hasNewKeys);
  show($('led-card'), hasNewKeys);
  show($('config-more-note'), !hasNewKeys);
  if (hasNewKeys) {
    const vc = Number(cfg.volume_cap);
    const led = Number(cfg.led_brightness);
    $('volcap-range').value = $('volcap-input').value = String(vc);
    $('led-range').value = $('led-input').value = String(led);
  }
}

function syncFromRange() {
  $('regen-input').value = $('regen-range').value;
}
function syncFromInput() {
  const v = Math.min(240, Math.max(1, Number($('regen-input').value) || 40));
  $('regen-range').value = String(Math.min(120, Math.max(5, v)));
}

async function saveTimer() {
  if (!state.serial) return markSerialDisconnected('Please reconnect to the Music Box first.');
  const minutes = Math.min(240, Math.max(1, Number($('regen-input').value) || 40));
  $('timer-save').disabled = true;
  setConnStatus('Saving…');
  try {
    await state.serial.setRegenMinutes(minutes);
    const res = await state.serial.saveConfig();
    stashConfig(state.device.sn, { regen_min: minutes });
    await loadConfigIntoForm();
    setConnStatus(
      res.includes('unchanged')
        ? 'Already saved — nothing changed.'
        : `Saved. It'll play in ${minutes}-minute cycles starting next time it refreshes.`,
      'ok'
    );
  } catch (e) {
    setConnStatus(`Save failed: ${friendlyError(e)}`, 'err');
  } finally {
    $('timer-save').disabled = false;
  }
}

async function applyNow() {
  if (!state.serial) return markSerialDisconnected('Please reconnect to the Music Box first.');
  $('apply-now').disabled = true;
  try {
    await state.serial.regenerateNow();
    await loadConfigIntoForm();
    setConnStatus('Applied — the Music Box is starting a fresh cycle now.', 'ok');
  } catch (e) {
    setConnStatus(`Could not apply now: ${friendlyError(e)}`, 'err');
  } finally {
    $('apply-now').disabled = false;
  }
}

async function restoreStashed(ev) {
  if (!state.serial) return markSerialDisconnected('Please reconnect to the Music Box first.');
  const v = Number(ev.currentTarget.dataset.value);
  if (!v) return;
  $('regen-input').value = String(v);
  await saveTimer();
}

// A range and its paired number input, kept in sync both ways and clamped.
function wireRangeNumber(rangeId, inputId, min, max) {
  const range = $(rangeId);
  const input = $(inputId);
  range.addEventListener('input', () => {
    input.value = range.value;
  });
  input.addEventListener('input', () => {
    const v = Math.min(max, Math.max(min, Number(input.value) || min));
    range.value = String(v);
  });
}

// volume_cap and led_brightness apply live on the device already (see
// music_box_config.h) - unlike the timer, there's no "takes effect next
// cycle" wait, so these are just SET + SAVE with no apply-now step needed.
async function saveVolCap() {
  if (!state.serial) return markSerialDisconnected('Please reconnect to the Music Box first.');
  const pct = Math.min(100, Math.max(0, Number($('volcap-input').value) || 0));
  $('volcap-save').disabled = true;
  setConnStatus('Saving…');
  try {
    await state.serial.setVolumeCap(pct);
    const res = await state.serial.saveConfig();
    stashConfig(state.device.sn, { volume_cap: pct });
    setConnStatus(
      res.includes('unchanged') ? 'Already saved — nothing changed.' : `Saved. Volume now capped at ${pct}%.`,
      'ok'
    );
  } catch (e) {
    setConnStatus(`Save failed: ${friendlyError(e)}`, 'err');
  } finally {
    $('volcap-save').disabled = false;
  }
}

async function saveLedBrightness() {
  if (!state.serial) return markSerialDisconnected('Please reconnect to the Music Box first.');
  const pct = Math.min(200, Math.max(0, Number($('led-input').value) || 0));
  $('led-save').disabled = true;
  setConnStatus('Saving…');
  try {
    await state.serial.setLedBrightness(pct);
    const res = await state.serial.saveConfig();
    stashConfig(state.device.sn, { led_brightness: pct });
    setConnStatus(
      res.includes('unchanged') ? 'Already saved — nothing changed.' : `Saved. LED brightness set to ${pct}%.`,
      'ok'
    );
  } catch (e) {
    setConnStatus(`Save failed: ${friendlyError(e)}`, 'err');
  } finally {
    $('led-save').disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Firmware tab
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

// Clears the leftover progress bar / log / "Flash firmware now" button from
// a previous update attempt. Without this, connecting fresh after a flash
// (finished or not) left the old "Firmware written, restarting…" furniture
// on screen next to a brand-new "Reconnected" status, which read as if the
// page couldn't make up its mind about what just happened.
function resetFlashSession() {
  const bar = $('fw-progress');
  show(bar, false);
  bar.value = 0;
  $('fw-log').hidden = true;
  $('fw-log').textContent = '';
  show($('fw-flash-row'), false);
  $('fw-flash').disabled = true;
  show($('fw-post'), false);
}

async function loadManifest() {
  try {
    state.manifest = await fetchManifest();
    state.latest = pickLatest(state.manifest);
    $('fw-latest-version').textContent = state.latest.version;
    $('whats-new-version').textContent = state.latest.version;
    $('whats-new-popover-version').textContent = state.latest.version;
    show($('whats-new-btn'), !!state.latest.notes);
    renderVersionsList();
    renderConnectionState();
  } catch (e) {
    $('fw-latest-version').textContent = '?';
    $('fw-hint').textContent = friendlyError(e);
  }
}

function renderVersionsList() {
  const ul = $('versions-list');
  ul.innerHTML = '';
  const older = (state.manifest?.releases || []).filter((r) => r.version !== state.latest?.version);
  for (const r of older) {
    const li = document.createElement('li');
    li.className = 'version-row';
    const firstLine = (r.notes || '').split('\n')[0] || '';
    li.innerHTML = `
      <div class="version-row-info">
        <span class="version-row-num">v${r.version}</span>
        <span class="version-row-date">${r.date || ''}</span>
        <span class="version-row-notes">${firstLine}</span>
      </div>
      <button type="button" class="btn btn-ghost version-row-btn">Install v${r.version}</button>
    `;
    li.querySelector('.version-row-btn').addEventListener('click', async () => {
      // "Other versions" isn't always a step backward — from an old enough
      // unit, one of these can be a real upgrade. Only call it a rollback
      // when we actually know the installed version is newer than this one.
      const cur = state.serial && state.device && !state.device.legacy ? state.device.fw : null;
      const cmp = cur ? compareVersions(r.version, cur) : null;
      const [titleVerb, buttonVerb] =
        cmp === null
          ? ['Install', 'Install']
          : cmp < 0
            ? ['Roll back to', 'Roll back']
            : cmp > 0
              ? ['Update to', 'Update']
              : ['Reinstall', 'Reinstall'];
      // The "loses browser-configurator support" warning only makes sense
      // when the unit currently HAS that support (proto >= 2) and the target
      // release doesn't — e.g. rolling 2.1.0 back to 1.0.0. Going from a
      // pre-config unit to another pre-config release isn't losing anything.
      const hadConfig = cur && (state.device.proto ?? 0) >= 2;
      const willHaveConfig = (r.proto ?? 0) >= 2;
      const configNote = hadConfig && !willHaveConfig
        ? 'This removes browser-configurator support until you update again.\n\n'
        : '';
      // Confirming here restarts the device and asks the browser to connect
      // to it right away, so this is the one moment guaranteed to be read
      // before that picker appears — worth repeating the heads-up here too.
      const body =
        configNote +
        'Your browser will then ask which device to connect to. It may just say ' +
        '“Unknown Device (16C0:0478)” — that’s normal; go ahead and select it.';
      const ok = await modalConfirm(body, {
        title: `${titleVerb} firmware v${r.version}?`,
        okText: buttonVerb,
        cancelText: 'Cancel',
      });
      if (ok) prepareDevice(r);
    });
    ul.appendChild(li);
  }
}

// Reconcile installed-vs-latest for the Firmware tab.
function reflectFirmware() {
  const connected = !!state.serial && !!state.device;
  const legacy = connected && state.device.legacy;
  const cur = connected && !legacy ? state.device.fw : null;

  $('fw-installed-version').textContent = legacy ? 'older' : cur || '—';
  $('fw-hint').textContent = connected
    ? legacy
      ? 'This unit predates the version protocol, so its exact firmware is unknown.'
      : ''
    : 'Connect in the Status tab to see your installed version.';

  const badge = $('fw-badge');
  const upToDate = cur && state.latest && compareVersions(cur, state.latest.version) >= 0;
  if (cur && state.latest) {
    badge.textContent = upToDate ? '✓ Up to date' : 'Update available';
    badge.className = `fw-badge ${upToDate ? 'fw-badge-ok' : 'fw-badge-warn'}`;
    show(badge, true);
  } else {
    show(badge, false);
  }

  const canFlash = 'hid' in navigator && !!state.latest;
  $('fw-start').disabled = !canFlash;
  $('fw-start').textContent = upToDate ? 'Reinstall current firmware' : 'Update firmware';
}

// Teensy 4's bootloader auto-returns to the app after a few seconds if nothing
// programs it, so we cannot afford a "reboot, then wait, then click again"
// flow. Strategy:
//   - download + verify the firmware BEFORE touching the device
//   - arm a navigator.hid "connect" listener that flashes the instant HalfKay
//     appears (works with zero clicks once HID permission has been granted)
//   - in the same click, also try requestDevice() so the very first run (no
//     permission yet) can still grab it inside the click's activation window

const HALFKAY_IS = (d) =>
  d.vendorId === HALFKAY_FILTER.vendorId && d.productId === HALFKAY_FILTER.productId;

let flashArmed = false;
let flashInFlight = false;
let flashTarget = null; // the release currently being prepared/flashed

// Some units in the field (device #1-11, beta era, pre-July-2023) run a
// different circuit board that this firmware cannot run on at all. The only
// case the wire protocol can't already rule out is total silence (no reply
// to !VERSION or !GET_STATUS at all) — anything that answers, even with an
// !ERR, is running code from this repo, which has only ever targeted
// Teensy 4.0. So this only gets asked for that one ambiguous case, right
// before the one action that actually risks stranding a sealed unit (the
// 134-baud reboot poke below) — and only once per browser, not once per
// page load: an owner's browser only ever talks to their own one Music Box,
// so once confirmed here it stays confirmed across refreshes/visits.
const HW_OK_STORE = 'tahigami.updater.hwConfirmed';
let compatConfirmedThisVisit = (() => {
  try {
    return localStorage.getItem(HW_OK_STORE) === '1';
  } catch {
    return false;
  }
})();

async function confirmPreProtocolHardware() {
  if (compatConfirmedThisVisit) return true;
  const raw = await modalPrompt(
    'Look for the small number printed on the unit and type it in here.\n\n' +
      'This firmware only runs on unit #12 and later. Earlier units used a ' +
      'different circuit board and can\u2019t take this update.',
    { title: 'One quick check before we restart your Music Box', placeholder: 'Unit number', okText: 'Continue' }
  );
  if (raw === null) return false; // owner cancelled
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) {
    await modalAlert('That doesn\u2019t look like the unit number. Please try again.', {
      title: 'Hmm, that\u2019s not a number',
    });
    return false;
  }
  if (n < 12) {
    await modalAlert(
      `Unit #${n} uses an older circuit board that this update can\u2019t run on. ` +
        'Please get in touch so we can help another way \u2014 nothing has been changed on your Music Box.',
      { title: 'This unit can\u2019t take this update' }
    );
    return false;
  }
  compatConfirmedThisVisit = true;
  try {
    localStorage.setItem(HW_OK_STORE, '1');
  } catch {
    /* storage unavailable — still holds for the rest of this page load */
  }
  return true;
}

function armConnectFlash() {
  if (flashArmed) return;
  flashArmed = true;
  navigator.hid.addEventListener('connect', (e) => {
    if (HALFKAY_IS(e.device) && flashTarget) flashNow(e.device, flashTarget);
  });
}

async function ensureFirmwareImage(release) {
  if (state.fwImages[release.version]) return state.fwImages[release.version];
  setFwStatus(`Downloading and checking firmware v${release.version}…`, 'busy');
  const hexText = await downloadFirmware(release);
  const image = parseIntelHex(hexText);
  state.fwImages[release.version] = image;
  return image;
}

async function prepareDevice(release) {
  release = release || state.latest;
  flashTarget = release;
  $('fw-start').disabled = true;
  show($('fw-flash-row'), true);
  $('fw-flash').disabled = false;

  try {
    await ensureFirmwareImage(release);
  } catch (e) {
    setFwStatus(friendlyError(e), 'err');
    $('fw-start').disabled = false;
    return;
  }
  armConnectFlash();

  // Get / reuse a serial session to trigger the reboot.
  let s = state.serial;
  let proto = state.device?.proto || 0;
  let reason = state.device?.reason;
  if (!s) {
    s = new MusicBoxSerial();
    try {
      await s.request();
      await s.open(115200);
      const info = await s.handshake();
      proto = info && !info.legacy ? info.proto || 0 : 0;
      reason = info?.reason;
      if (info && !info.legacy) {
        state.serial = s;
        state.device = info;
        renderConnectionState();
        startHeartbeat();
      }
    } catch {
      setFwStatus(
        'Couldn’t open the Music Box. If it is already in update mode (silent, LED off), ' +
          'click “Flash firmware now”.',
        'warn'
      );
      $('fw-start').disabled = false;
      return;
    }
  }

  if (proto >= 2) {
    try {
      const cfg = await s.getConfig();
      stashConfig(state.device?.sn, {
        regen_min: Number(cfg.regen_min),
        volume_cap: cfg.volume_cap != null ? Number(cfg.volume_cap) : undefined,
        led_brightness: cfg.led_brightness != null ? Number(cfg.led_brightness) : undefined,
      });
    } catch {
      /* best effort */
    }
    setFwStatus('Restarting the Music Box into update mode…', 'busy');
    await s.requestBootloaderCommand();
    markSerialDisconnected('Disconnected for the update — reconnect when it finishes.');
  } else {
    // Only the totally-silent case is hardware-ambiguous. Any device that
    // answers !ERR/!STATUS at all is running code from this repo, which has
    // only ever targeted Teensy 4.0 — that alone already proves the board,
    // no need to ask again (e.g. rolling a v2.0.0 unit back to v1.0.0).
    const hardwareUnknown = reason === 'silent' || !reason;
    if (hardwareUnknown && !(await confirmPreProtocolHardware())) {
      setFwStatus('Update cancelled — nothing was changed.', 'warn');
      $('fw-start').disabled = false;
      $('fw-flash').disabled = true;
      show($('fw-flash-row'), false);
      flashTarget = null;
      return;
    }
    setFwStatus('Trying another way to restart it…', 'busy');
    try {
      await s.pokeBootloader();
    } catch {
      /* ignore */
    }
    markSerialDisconnected('Disconnected for the update — reconnect when it finishes.');
  }

  // Same-gesture grab for the first run (no HID permission yet). Chrome usually
  // still honours the activation ~1-2s after the click.
  try {
    const picked = await navigator.hid.requestDevice({ filters: [HALFKAY_FILTER] });
    if (picked[0]) {
      await flashNow(picked[0], release);
      return;
    }
  } catch {
    /* activation expired or user dismissed — fall through */
  }

  // Otherwise: if permission exists, the connect listener will fire; if not,
  // the user must click "Flash firmware now" while HalfKay is up.
  const granted = (await navigator.hid.getDevices()).some(HALFKAY_IS);
  setFwStatus(
    granted
      ? 'Waiting for update mode… it should start on its own.'
      : 'When the Music Box goes silent, click “Flash firmware now” right away and pick it ' +
          'from the list. It only stays in update mode for a few seconds — if you miss it, ' +
          'just click again.',
    'warn'
  );
}

async function flashFirmware() {
  // Manual button: HalfKay should already be on the bus.
  const release = flashTarget || state.latest;
  $('fw-flash').disabled = true;
  try {
    await ensureFirmwareImage(release);
    armConnectFlash();
    let device = (await navigator.hid.getDevices()).find(HALFKAY_IS);
    if (!device) {
      const picked = await navigator.hid.requestDevice({ filters: [HALFKAY_FILTER] });
      device = picked[0];
    }
    if (!device) {
      setFwStatus(
        'Nothing to select yet \u2014 the Music Box isn\u2019t in update mode right now. ' +
          'Click “Update firmware” and try again quickly.',
        'err'
      );
      $('fw-flash').disabled = false;
      return;
    }
    await flashNow(device, release);
  } catch (e) {
    setFwStatus(`Update failed: ${friendlyError(e)}`, 'err');
    $('fw-flash').disabled = false;
  }
}

async function flashNow(device, release) {
  if (flashInFlight) return;
  flashInFlight = true;
  $('fw-flash').disabled = true;
  $('fw-start').disabled = true;
  const bar = $('fw-progress');
  show(bar, true);
  bar.value = 0;
  try {
    const image = await ensureFirmwareImage(release);
    setFwStatus(`Writing firmware v${release.version} — keep the cable connected.`, 'busy');
    const result = await flashImage(device, image, {
      onProgress: (done, total) => {
        bar.max = total;
        bar.value = done;
      },
      log: fwLog,
    });
    if (result?.rebooted === false) {
      setFwStatus(
        `Firmware written, but the Music Box didn’t restart on its own. Unplug the USB cable ` +
          `for a few seconds, then plug it back in — it’ll come up running firmware ${release.version}.`,
        'warn'
      );
    } else {
      setFwStatus(`Done. The Music Box is now running firmware ${release.version}.`, 'ok');
    }
    show($('fw-post'), true);
  } catch (e) {
    setFwStatus(`Update failed: ${friendlyError(e)}`, 'err');
    fwLog(
      'If it\u2019s still in update mode, you can just try again. Otherwise click \u201cUpdate ' +
        'firmware\u201d to restart it into update mode, then try again.'
    );
    $('fw-flash').disabled = false;
    $('fw-start').disabled = false;
  } finally {
    flashInFlight = false;
    flashTarget = null;
  }
}

async function reconnectAndRestore() {
  resetFlashSession();
  if (state.serial) {
    // Already connected — e.g. the owner used the Status tab's button in
    // between. There's genuinely nothing to reconnect, so say that plainly
    // instead of racing into a doomed second connection attempt on the same
    // port (which used to surface as a bare "Already connected." error).
    setFwStatus('Already connected — nothing to reconnect.', '');
    return;
  }
  $('fw-reconnect').disabled = true;
  setFwStatus('Reconnecting…', 'busy');
  const s = new MusicBoxSerial();
  try {
    await s.request();
    await s.open(115200);
    const info = await s.handshake();
    state.serial = s;
    state.device = info;
    renderConnectionState();

    if (info.legacy) {
      $('fw-post').hidden = true;
      setFwStatus(`Reconnected — now running older firmware.`, 'warn');
      return;
    }

    startHeartbeat();
    $('fw-post').hidden = true;

    // The connection itself is good from here on — a hiccup restoring a
    // stashed setting shouldn't be reported as a failed reconnect (and
    // mustn't tear down a working connection over it).
    try {
      const stash = readStash()[info.sn || 'default'];
      let restored = false;
      if (stash?.regen_min) {
        await s.setRegenMinutes(stash.regen_min);
        restored = true;
      }
      if (stash?.volume_cap != null) {
        await s.setVolumeCap(stash.volume_cap);
        restored = true;
      }
      if (stash?.led_brightness != null) {
        await s.setLedBrightness(stash.led_brightness);
        restored = true;
      }
      if (restored) await s.saveConfig();
      await loadConfigIntoForm();
      setFwStatus(`Reconnected — now running firmware ${info.fw || '?'}.`, 'ok');
    } catch (e) {
      setFwStatus(`Reconnected, but a saved setting couldn’t be restored: ${friendlyError(e)}`, 'warn');
    }
  } catch (e) {
    await s.close().catch(() => {});
    setFwStatus(`Couldn’t reconnect: ${friendlyError(e)}`, 'err');
    $('fw-reconnect').disabled = false;
  }
}

// ---------------------------------------------------------------------------
function wire() {
  for (const t of TABS) $(`tab-btn-${t}`).addEventListener('click', () => switchTab(t));

  $('connect-btn')?.addEventListener('click', connectSerial);

  $('regen-range')?.addEventListener('input', syncFromRange);
  $('regen-input')?.addEventListener('input', syncFromInput);
  $('timer-save')?.addEventListener('click', saveTimer);
  $('apply-now')?.addEventListener('click', applyNow);
  $('restore-btn')?.addEventListener('click', restoreStashed);

  wireRangeNumber('volcap-range', 'volcap-input', 0, 100);
  $('volcap-save')?.addEventListener('click', saveVolCap);
  wireRangeNumber('led-range', 'led-input', 0, 200);
  $('led-save')?.addEventListener('click', saveLedBrightness);

  $('fw-start')?.addEventListener('click', () => prepareDevice(state.latest));
  $('fw-flash')?.addEventListener('click', flashFirmware);
  $('fw-reconnect')?.addEventListener('click', reconnectAndRestore);

  $('whats-new-btn')?.addEventListener('click', () => {
    const list = $('whats-new-list');
    list.innerHTML = '';
    // A "## " line groups the bullets under it (for a changelog with enough
    // going on to need sections); a plain line renders as a normal bullet,
    // with an optional leading "- " stripped for authors used to writing it.
    for (const raw of (state.latest?.notes || '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const li = document.createElement('li');
      if (line.startsWith('## ')) {
        li.textContent = line.slice(3);
        li.className = 'whats-new-heading';
      } else {
        li.textContent = line.replace(/^-\s*/, '');
      }
      list.appendChild(li);
    }
    show($('whats-new-popover'), true);
  });
  $('whats-new-close')?.addEventListener('click', () => show($('whats-new-popover'), false));
}

renderConnectionState();
if (gate()) {
  wire();
  loadManifest();
} else {
  wire(); // still wire the copy-link button
}
