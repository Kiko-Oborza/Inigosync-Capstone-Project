// IñigoSync — Login / Sign up / OTP Verify / Admin modal controller
// Handles: opening the modal from any [data-auth-open] trigger,
// closing via backdrop/close button/Escape, switching between
// the Log In, Sign Up, Verify (OTP), and Admin panels, and password
// show/hide toggles.
//
// Note: the Admin panel is login-only — the Log In / Sign Up tab bar is
// automatically hidden whenever the Admin or Verify panel is active. The
// Verify panel is a one-off step shown right after Sign Up is submitted;
// it has no tab of its own and is only reached programmatically.

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
        // panel is login-only and the Verify panel is a one-off step, so
        // hide the tab bar while either is active.
        if (authTabsEl) {
            authTabsEl.hidden = name === 'admin' || name === 'verify';
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
    // Wire this up to the real auth endpoints once the backend is ready.
    // (This also covers the Admin panel — its mode resolves to "admin".)
    panels.forEach((form) => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const mode = form.dataset.authPanel;
            const data = Object.fromEntries(new FormData(form));
            console.log(`[auth] ${mode} submitted`, data);

            // TODO: replace with real API calls once the backend is ready.
            // Admin submissions should hit a separate admin-auth endpoint/role
            // check on the backend, not the customer registration/login one.

            if (mode === 'signup') {
                // Don't log the customer in yet — send them to email
                // verification first. TODO: trigger the real "send OTP"
                // API call here once the backend endpoint exists.
                const emailLabel = overlay.querySelector('[data-verify-email]');
                if (emailLabel) emailLabel.textContent = data.email || 'your email';
                setActivePanel('verify');
                startOtpFlow();
                return;
            }

            if (mode === 'verify') {
                // Placeholder only — no real code is checked yet.
                // TODO: send the entered code to a "verify OTP" endpoint,
                // then closeModal() (or log the user in) on success.
                return;
            }

            // login / admin
            closeModal();
        });
    });

    // ------------------------------------------------------------------
    // OTP verification UI (design/demo only — no real code is checked yet)
    // ------------------------------------------------------------------
    const otpBoxes = Array.from(overlay.querySelectorAll('[data-otp-box]'));
    const otpError = overlay.querySelector('[data-otp-error]');
    const otpResendBtn = overlay.querySelector('[data-otp-resend]');
    const otpTimerEl = overlay.querySelector('[data-otp-timer]');
    let otpTimerId = null;

    function startOtpFlow() {
        otpBoxes.forEach((box) => {
            box.value = '';
            box.classList.remove('is-filled');
        });
        if (otpError) otpError.classList.remove('is-visible');
        if (otpBoxes[0]) otpBoxes[0].focus();
        startResendCountdown(30);
    }

    function startResendCountdown(seconds) {
        if (otpTimerId) window.clearInterval(otpTimerId);
        let remaining = seconds;
        if (otpResendBtn) otpResendBtn.disabled = true;

        const tick = () => {
            if (otpTimerEl) otpTimerEl.textContent = `Resend available in ${remaining}s`;
            if (remaining <= 0) {
                window.clearInterval(otpTimerId);
                if (otpTimerEl) otpTimerEl.textContent = '';
                if (otpResendBtn) otpResendBtn.disabled = false;
                return;
            }
            remaining -= 1;
        };

        tick();
        otpTimerId = window.setInterval(tick, 1000);
    }

    otpBoxes.forEach((box, index) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
            box.classList.toggle('is-filled', box.value.length === 1);
            if (box.value && otpBoxes[index + 1]) otpBoxes[index + 1].focus();
        });

        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && otpBoxes[index - 1]) {
                otpBoxes[index - 1].focus();
            }
        });

        box.addEventListener('paste', (e) => {
            const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
            if (!pasted) return;
            e.preventDefault();
            pasted.split('').slice(0, otpBoxes.length).forEach((digit, i) => {
                if (otpBoxes[i]) {
                    otpBoxes[i].value = digit;
                    otpBoxes[i].classList.add('is-filled');
                }
            });
            const next = otpBoxes[Math.min(pasted.length, otpBoxes.length - 1)];
            if (next) next.focus();
        });
    });

    if (otpResendBtn) {
        otpResendBtn.addEventListener('click', () => {
            console.log('[auth] resend OTP requested (placeholder)');
            startResendCountdown(30);
        });
    }

    // ------------------------------------------------------------------
    // Google Sign-In / Sign-Up (customer accounts only — the Admin and
    // Verify panels stay credential-only on purpose, so no Google button
    // is rendered there).
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

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'auth-google-button';
            button.innerHTML = `
                <span class="auth-google-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path fill="#4285F4" d="M21.6 12.23c0-.78-.07-1.53-.2-2.25H12v4.26h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.32 2.98-7.53z"></path>
                        <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.75-5.59-4.1H3.07v2.58A10 10 0 0 0 12 22z"></path>
                        <path fill="#FBBC05" d="M6.41 13.93A5.98 5.98 0 0 1 6.41 8.07V5.49H3.07a10 10 0 0 0 0 16.88l3.34-2.44z"></path>
                        <path fill="#EA4335" d="M12 6.04c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.96 9.96 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.44C7.2 7.79 9.4 6.04 12 6.04z"></path>
                    </svg>
                </span>
                <span>Login / Sign up with Google</span>
            `;

            button.addEventListener('click', () => {
                if (window.google?.accounts?.id) {
                    google.accounts.id.prompt();
                }
            });

            container.appendChild(button);
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