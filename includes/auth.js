// IñigoSync — Login / Sign up / Admin modal controller
// Handles: opening the modal from any [data-auth-open] trigger,
// closing via backdrop/close button/Escape, switching between
// the Log In, Sign Up, and Admin panels, and password show/hide toggles.
//
// Note: the Admin panel is login-only — the Log In / Sign Up tab bar is
// automatically hidden whenever the Admin panel is active, and the Admin
// panel itself has no sign-up/registration link, only a "back to customer
// login" link.

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector('[data-auth-overlay]');
    if (!overlay) return;

    const modal = overlay.querySelector('.auth-modal');
    const authTabsEl = overlay.querySelector('[data-auth-tabs]');
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

        // Customers can switch between Log In / Sign Up, but the Admin
        // panel is login-only, so hide that tab bar while it's active.
        if (authTabsEl) {
            authTabsEl.hidden = name === 'admin';
        }
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

    // Tab / inline switch links (Log In ↔ Sign Up ↔ Admin ↔ back to Log In)
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
    // (This also covers the Admin panel — its mode resolves to "admin".)
    panels.forEach((form) => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const mode = form.dataset.authPanel;
            console.log(`[auth] ${mode} submitted`, Object.fromEntries(new FormData(form)));

            // TODO: replace with real API call (fetch to backend auth endpoint).
            // Admin submissions should hit a separate admin-auth endpoint/role
            // check on the backend, not the customer registration/login one.
            closeModal();
        });
    });

    // ------------------------------------------------------------------
    // Google Sign-In / Sign-Up (customer accounts only — the Admin panel
    // stays credential-only on purpose, so no Google button is rendered
    // there).
    //
    // IMPORTANT SETUP STEPS before this works:
    //   1. Create an OAuth 2.0 Client ID (Web application) in the Google
    //      Cloud Console and add your site's origin(s) to
    //      "Authorized JavaScript origins".
    //   2. Paste that client ID into GOOGLE_CLIENT_ID below.
    //   3. Build a backend endpoint (e.g. POST /api/auth/google) that
    //      receives the ID token from handleGoogleCredential(), verifies
    //      it server-side with Google's token info / a Google auth
    //      library, then creates the user record (if new) or logs them
    //      in, and starts a session. Never trust a decoded token on the
    //      client for real authentication — decoding here is only to
    //      preview the profile info you'll get back.
    // ------------------------------------------------------------------
    const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

    function handleGoogleCredential(response) {
        // response.credential is a signed JWT ID token from Google.
        // TODO: send it to your backend instead of using it directly:
        //   fetch('/api/auth/google', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({ credential: response.credential })
        //   })
        //   .then((res) => res.json())
        //   .then((data) => { /* handle session/redirect */ });
        console.log('[auth] Google credential received', response.credential);
        closeModal();
    }

    function renderGoogleButtons() {
        if (!window.google || !google.accounts || !google.accounts.id) return false;
        if (GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE_CLIENT_ID')) {
            console.warn('[auth] Set GOOGLE_CLIENT_ID in includes/auth.js before Google Sign-In will work.');
        }

        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredential,
        });

        overlay.querySelectorAll('[data-google-btn]').forEach((container) => {
            container.innerHTML = '';
            google.accounts.id.renderButton(container, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                shape: 'pill',
                text: container.id === 'google-signin-signup' ? 'signup_with' : 'continue_with',
                logo_alignment: 'left',
                width: 340,
            });
        });

        return true;
    }

    // The Google script tag is loaded with async/defer, so it may not be
    // ready yet at DOMContentLoaded — poll briefly until it is.
    if (!renderGoogleButtons()) {
        let attempts = 0;
        const poll = window.setInterval(() => {
            attempts += 1;
            if (renderGoogleButtons() || attempts > 50) {
                window.clearInterval(poll);
            }
        }, 100);
    }
});