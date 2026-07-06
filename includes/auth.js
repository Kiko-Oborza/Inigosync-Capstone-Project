// IñigoSync — Login / Sign up modal controller
// Handles: opening the modal from any [data-auth-open] trigger,
// closing via backdrop/close button/Escape, switching between
// the Log In and Sign Up panels, and password show/hide toggles.

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector('[data-auth-overlay]');
    if (!overlay) return;

    const modal = overlay.querySelector('.auth-modal');
    const tabs = overlay.querySelectorAll('[data-auth-tab]');
    const panels = overlay.querySelectorAll('[data-auth-panel]');
    let lastFocusedEl = null;

    function setActivePanel(name) {
        tabs.forEach((tab) => {
            const isMatch = tab.dataset.authTab === name;
            tab.classList.toggle('is-active', isMatch);
            if (tab.getAttribute('role') === 'tab') {
                tab.setAttribute('aria-selected', String(isMatch));
            }
        });
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.authPanel === name);
        });
    }

    function openModal(panelName) {
        lastFocusedEl = document.activeElement;
        overlay.hidden = false;
        // Force reflow so the transition runs after removing [hidden]
        requestAnimationFrame(() => {
            overlay.setAttribute('data-open', '');
        });
        document.body.classList.add('auth-lock');
        if (panelName) setActivePanel(panelName);

        const activePanel = overlay.querySelector('.auth-form.is-active');
        const firstField = activePanel && activePanel.querySelector('input');
        if (firstField) firstField.focus();
    }

    function closeModal() {
        overlay.removeAttribute('data-open');
        document.body.classList.remove('auth-lock');
        window.setTimeout(() => {
            overlay.hidden = true;
        }, 250);
        if (lastFocusedEl) lastFocusedEl.focus();
    }

    // Open triggers (Book Now buttons, etc.)
    document.querySelectorAll('[data-auth-open]').forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(trigger.dataset.authOpen || 'login');
        });
    });

    // Close triggers
    overlay.querySelectorAll('[data-auth-close]').forEach((btn) => {
        btn.addEventListener('click', closeModal);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    // Tab / inline switch links
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => setActivePanel(tab.dataset.authTab));
    });

    // Password visibility toggles
    overlay.querySelectorAll('[data-toggle-password]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });

    // Basic client-side validation feedback + placeholder submit handling.
    // Wire this up to the real auth endpoint once the backend is ready.
    panels.forEach((form) => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const mode = form.dataset.authPanel;
            console.log(`[auth] ${mode} submitted`, Object.fromEntries(new FormData(form)));

            // TODO: replace with real API call (fetch to backend auth endpoint)
            closeModal();
        });
    });
});