// A tiny custom dialog system standing in for confirm()/prompt()/alert().
// Those raw browser dialogs read as a random site popup, not part of this
// page — this keeps the same look and voice as the rest of the updater for
// the few moments (rollback, hardware check) that need a real pause.
// One overlay, built once and reused; every call returns a Promise.

let overlay, titleEl, bodyEl, inputEl, cancelBtn, okBtn, resolveFn;

function close(value) {
  overlay.hidden = true;
  document.removeEventListener('keydown', onKey);
  if (resolveFn) {
    const r = resolveFn;
    resolveFn = null;
    r(value);
  }
}

function onKey(e) {
  if (e.key === 'Escape') close(inputEl.hidden ? false : null);
  else if (e.key === 'Enter') close(inputEl.hidden ? true : inputEl.value);
}

function ensureModal() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title">
      <h3 id="modal-title"></h3>
      <p id="modal-body"></p>
      <input id="modal-input" type="text" inputmode="numeric" hidden />
      <div class="modal-actions">
        <button type="button" id="modal-cancel" class="btn btn-ghost">Cancel</button>
        <button type="button" id="modal-ok" class="btn btn-primary">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  titleEl = overlay.querySelector('#modal-title');
  bodyEl = overlay.querySelector('#modal-body');
  inputEl = overlay.querySelector('#modal-input');
  cancelBtn = overlay.querySelector('#modal-cancel');
  okBtn = overlay.querySelector('#modal-ok');

  cancelBtn.addEventListener('click', () => close(inputEl.hidden ? false : null));
  okBtn.addEventListener('click', () => close(inputEl.hidden ? true : inputEl.value));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(inputEl.hidden ? false : null);
  });
}

function open({ kind, title, message, okText, cancelText, placeholder }) {
  ensureModal();
  return new Promise((resolve) => {
    resolveFn = resolve;
    titleEl.textContent = title || '';
    bodyEl.textContent = message || '';
    inputEl.hidden = kind !== 'prompt';
    inputEl.value = '';
    inputEl.placeholder = placeholder || '';
    show(cancelBtn, kind !== 'alert');
    okBtn.textContent = okText || 'OK';
    cancelBtn.textContent = cancelText || 'Cancel';
    overlay.hidden = false;
    document.addEventListener('keydown', onKey);
    (kind === 'prompt' ? inputEl : okBtn).focus();
  });
}

function show(el, on) {
  el.toggleAttribute('hidden', !on);
}

export function modalAlert(message, opts = {}) {
  return open({ kind: 'alert', message, ...opts });
}

export function modalConfirm(message, opts = {}) {
  return open({ kind: 'confirm', message, ...opts });
}

export function modalPrompt(message, opts = {}) {
  return open({ kind: 'prompt', message, ...opts });
}
