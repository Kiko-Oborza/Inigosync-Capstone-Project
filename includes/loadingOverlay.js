// Shared full-screen loading overlay used while real auth/session work is in
// flight (login submit, Google OAuth return, dashboard session+profile
// check). Injects its markup lazily on first use so it doesn't need to be
// hand-pasted into every page. Enforces a small minimum visible time so it
// never flickers on very fast connections — it still waits for the real
// result if that takes longer, it just won't hide sooner than the floor.
(function () {
    const MIN_VISIBLE_MS = 400;

    let overlayEl = null;
    let textEl = null;
    let visible = false;
    let shownAt = 0;
    let hideTimer = null;

    function ensureOverlay() {
        if (overlayEl) return overlayEl;

        overlayEl = document.createElement('div');
        overlayEl.className = 'inigo-loading-overlay';
        overlayEl.setAttribute('aria-live', 'polite');
        overlayEl.setAttribute('aria-busy', 'true');
        overlayEl.hidden = true;
        overlayEl.innerHTML = `
            <div class="inigo-loading-card">
                <div class="inigo-loading-ring" aria-hidden="true">
                    <img src="../assets/Logo/WebLogo.png" alt="" class="inigo-loading-logo">
                </div>
                <p class="inigo-loading-text" data-inigo-loading-text></p>
            </div>
        `;
        textEl = overlayEl.querySelector('[data-inigo-loading-text]');
        document.body.appendChild(overlayEl);
        return overlayEl;
    }

    function show(message) {
        const el = ensureOverlay();
        if (textEl) textEl.textContent = message || 'Loading…';

        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }

        if (visible) return;
        visible = true;
        shownAt = Date.now();
        el.hidden = false;
        requestAnimationFrame(() => el.setAttribute('data-open', ''));
    }

    function hide() {
        if (!visible || !overlayEl) return;

        const elapsed = Date.now() - shownAt;
        const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

        hideTimer = window.setTimeout(() => {
            hideTimer = null;
            visible = false;
            overlayEl.removeAttribute('data-open');
            window.setTimeout(() => {
                if (!visible && overlayEl) overlayEl.hidden = true;
            }, 250);
        }, wait);
    }

    window.InigoLoading = { show, hide };
})();

// Shared toast for real success/error feedback on dashboard actions (booking
// submit, profile save, etc.) — same fixed-pill pattern as includes/auth.js's
// setAuthNotice, factored out here so every dashboard can reuse one helper
// instead of three near-identical copies.
(function () {
    let toastEl = null;
    let dismissTimer = null;
    let hideTimer = null;

    function ensureToast() {
        if (toastEl) return toastEl;
        toastEl = document.createElement('p');
        toastEl.className = 'inigo-toast';
        toastEl.setAttribute('aria-live', 'polite');
        toastEl.hidden = true;
        document.body.appendChild(toastEl);
        return toastEl;
    }

    function show(message, isError = false, duration = isError ? 5000 : 3500) {
        const el = ensureToast();
        if (dismissTimer) window.clearTimeout(dismissTimer);
        if (hideTimer) window.clearTimeout(hideTimer);

        el.hidden = false;
        el.textContent = message;
        el.classList.toggle('is-error', isError);
        requestAnimationFrame(() => el.classList.add('is-visible'));

        dismissTimer = window.setTimeout(() => {
            el.classList.remove('is-visible');
            hideTimer = window.setTimeout(() => {
                el.hidden = true;
            }, 250);
        }, duration);
    }

    window.InigoToast = { show };
})();
