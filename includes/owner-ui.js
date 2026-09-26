// Shared owner dialog behavior. Loaded before the independent panel controllers.
(() => {
    const origins = new WeakMap();
    const focusable = (root) => [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter(el => !el.hidden && getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length);
    function open(modal) {
        if (!modal) return;
        origins.set(modal, document.activeElement);
        modal.hidden = false;
        modal.setAttribute('data-open', '');
        (focusable(modal)[0] || modal.querySelector('[role="dialog"]'))?.focus();
    }
    function close(modal) {
        if (!modal) return;
        modal.hidden = true;
        modal.removeAttribute('data-open');
        const origin = origins.get(modal);
        if (origin?.isConnected) origin.focus();
    }
    let activeConfirmation = null;
    async function confirm(options = {}) {
        if (activeConfirmation) return false;
        const { title = 'Discard changes?', message = 'Your unsaved changes will be lost.', confirmLabel = 'Discard changes', danger = false } = typeof options === 'string' ? { message: options } : options;
        const overlay = document.createElement('div');
        overlay.className = 'admin-modal-overlay owner-confirm-overlay';
        overlay.hidden = true;
        overlay.innerHTML = '<div class="admin-modal owner-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ownerConfirmTitle" aria-describedby="ownerConfirmMessage" tabindex="-1"><h3 id="ownerConfirmTitle"></h3><p id="ownerConfirmMessage"></p><div class="admin-form-actions"><button type="button" class="admin-btn-ghost" data-confirm-no>Cancel</button><button type="button" data-confirm-yes></button></div></div>';
        overlay.querySelector('h3').textContent = title;
        overlay.querySelector('p').textContent = message;
        const yes = overlay.querySelector('[data-confirm-yes]');
        yes.className = danger ? 'admin-btn-chip-danger' : 'admin-btn-save';
        yes.textContent = confirmLabel;
        document.body.append(overlay);
        return new Promise(resolve => {
            const finish = value => {
                activeConfirmation = null;
                close(overlay);
                overlay.remove();
                resolve(value);
            };
            activeConfirmation = { overlay, finish };
            overlay.querySelector('[data-confirm-no]').onclick = () => finish(false);
            yes.onclick = () => finish(true);
            open(overlay);
        });
    }
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && activeConfirmation) {
            event.preventDefault(); event.stopImmediatePropagation();
            activeConfirmation.finish(false);
            return;
        }
        if (event.key !== 'Tab') return;
        const modal = activeConfirmation?.overlay || [...document.querySelectorAll('.admin-modal-overlay:not([hidden]),.ioc-overlay:not([hidden])')].at(-1);
        if (!modal) return;
        const items = focusable(modal);
        if (!items.length) { event.preventDefault(); return; }
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modal.querySelector('[role="dialog"]') || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }, true);
    window.InigoOwnerUI = { open, close, confirm, recordActivity: () => {} };
})();
