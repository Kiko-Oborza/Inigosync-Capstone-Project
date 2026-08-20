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
    let pendingSignupEmail = '';

    const DASHBOARD_BY_ROLE = {
        customer: 'user_dashboard.html',
        staff: 'staff_dashboard.html',
        admin: 'owner_dashboard.html'
    };

    // After a successful signInWithPassword, confirm the account's role is one
    // of `allowedRoles` for the panel that was used (customer login vs Admin
    // login), then redirect to the matching dashboard. Signs back out and
    // throws if the role doesn't belong on this panel, so nobody can reach a
    // dashboard by guessing/mismatching credentials on the wrong form.
    async function completeLogin(allowedRoles) {
        const { data: { session } } = await window.sb.auth.getSession();
        if (!session) throw new Error('Sign-in failed. Please try again.');

        const { data: profile, error: profileError } = await window.sb
            .from('profiles')
            .select('role, status')
            .eq('id', session.user.id)
            .single();

        if (profileError || !profile) {
            await window.sb.auth.signOut();
            throw new Error('Could not load your account. Please try again.');
        }

        if (profile.status === 'disabled') {
            await window.sb.auth.signOut();
            throw new Error('This account has been disabled. Contact the front desk.');
        }

        if (!allowedRoles.includes(profile.role)) {
            await window.sb.auth.signOut();
            throw new Error(allowedRoles.includes('customer')
                ? 'This is a staff/owner account — please use "Log in as Admin" instead.'
                : 'This account is not authorized for staff/owner access.');
        }

        closeModal();
        const redirectUrl = new URL(DASHBOARD_BY_ROLE[profile.role], window.location.href);
        window.location.assign(redirectUrl.toString());
    }

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
    function setPasswordToggleIcon(btn, isVisible) {
        const visibleIcon = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>`;

        const hiddenIcon = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-6 10-6 10 6 10 6-3 6-10 6S2 12 2 12z"/>
                <circle cx="12" cy="12" r="3"/>
                <path d="M4 4l16 16"/>
            </svg>`;

        btn.innerHTML = isVisible ? visibleIcon : hiddenIcon;
        btn.setAttribute('aria-label', isVisible ? 'Hide password' : 'Show password');
    }

    overlay.querySelectorAll('[data-toggle-password]').forEach((btn) => {
        const input = btn.previousElementSibling;
        if (!input) return;

        setPasswordToggleIcon(btn, input.type === 'text');

        btn.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            setPasswordToggleIcon(btn, input.type === 'text');
        });
    });

    // Wired to real Supabase Auth. Public signup always creates a customer
    // account (role is never client-settable — see the DB trigger); the
    // Admin panel logs into the same auth.users but only accepts an
    // account whose profiles.role is staff/admin.
    panels.forEach((form) => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            if (!window.sb) {
                setAuthNotice('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            const mode = form.dataset.authPanel;
            const data = Object.fromEntries(new FormData(form));
            const submitBtn = form.querySelector('.auth-submit');

            function setBusy(isBusy) {
                if (!submitBtn) return;
                submitBtn.disabled = isBusy;
                submitBtn.classList.toggle('is-loading', isBusy);
            }

            setAuthNotice('');
            setBusy(true);

            try {
                if (mode === 'login') {
                    const { error } = await window.sb.auth.signInWithPassword({
                        email: data.email,
                        password: data.password
                    });
                    if (error) throw error;
                    await completeLogin(['customer']);
                    return;
                }

                if (mode === 'signup') {
                    const { data: signUpData, error } = await window.sb.auth.signUp({
                        email: data.email,
                        password: data.password,
                        options: {
                            data: {
                                full_name: data.fullname,
                                contact_num: data.mobile
                            }
                        }
                    });
                    if (error) throw error;

                    if (signUpData.session) {
                        // Email confirmation is turned off for this project —
                        // signUp already returned a live session.
                        closeModal();
                        const redirectUrl = new URL('user_dashboard.html', window.location.href);
                        window.location.assign(redirectUrl.toString());
                        return;
                    }

                    pendingSignupEmail = data.email;
                    const emailLabel = overlay.querySelector('[data-verify-email]');
                    if (emailLabel) emailLabel.textContent = data.email || 'your email';
                    setActivePanel('verify');
                    startOtpFlow();
                    return;
                }

                if (mode === 'verify') {
                    const code = otpBoxes.map((box) => box.value).join('');
                    if (code.length !== 6 || !pendingSignupEmail) {
                        if (otpError) otpError.classList.add('is-visible');
                        return;
                    }

                    const { error } = await window.sb.auth.verifyOtp({
                        email: pendingSignupEmail,
                        token: code,
                        type: 'signup'
                    });

                    if (error) {
                        if (otpError) otpError.classList.add('is-visible');
                        throw error;
                    }

                    if (otpError) otpError.classList.remove('is-visible');
                    closeModal();
                    const redirectUrl = new URL('user_dashboard.html', window.location.href);
                    window.location.assign(redirectUrl.toString());
                    return;
                }

                if (mode === 'admin') {
                    const { error } = await window.sb.auth.signInWithPassword({
                        email: data['admin-email'],
                        password: data['admin-password']
                    });
                    if (error) throw error;
                    await completeLogin(['staff', 'admin']);
                    return;
                }
            } catch (err) {
                setAuthNotice(err.message || 'Something went wrong. Please try again.', true);
            } finally {
                setBusy(false);
            }
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
        otpResendBtn.addEventListener('click', async () => {
            if (!window.sb || !pendingSignupEmail) return;
            otpResendBtn.disabled = true;
            const { error } = await window.sb.auth.resend({
                type: 'signup',
                email: pendingSignupEmail
            });
            if (error) {
                setAuthNotice(error.message || 'Could not resend the code. Please try again.', true);
                otpResendBtn.disabled = false;
                return;
            }
            startResendCountdown(30);
        });
    }

    // ------------------------------------------------------------------
    // Google Sign-In / Sign-Up (customer accounts only — the Admin and
    // Verify panels stay credential-only on purpose, so no Google button
    // is rendered there).
    //
    // IMPORTANT SETUP STEPS before this works in production:
    //   1. Create an OAuth 2.0 Client ID (Web application) in the Google
    //      Cloud Console and add your site's origin(s) to
    //      "Authorized JavaScript origins".
    //   2. Set window.INIGOSYNC_GOOGLE_CONFIG.clientId (or replace the
    //      placeholder below) with your client ID.
    //   3. Build a backend endpoint (e.g. POST /api/auth/google) that
    //      receives the ID token, verifies it server-side, and creates a
    //      session for the user.
    // ------------------------------------------------------------------
    const googleConfig = window.INIGOSYNC_GOOGLE_CONFIG || {};
    const GOOGLE_CLIENT_ID = googleConfig.clientId || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
    const GOOGLE_AUTH_ENDPOINT = googleConfig.authEndpoint || '/api/auth/google.php';

    function getAuthNoticeEl() {
        let notice = overlay.querySelector('[data-auth-notice]');
        if (!notice) {
            notice = document.createElement('p');
            notice.className = 'auth-status';
            notice.dataset.authNotice = '';
            notice.setAttribute('aria-live', 'polite');
            notice.hidden = true;

            const authBrand = overlay.querySelector('.auth-brand');
            if (authBrand && authBrand.parentNode) {
                authBrand.parentNode.insertBefore(notice, authBrand.nextSibling);
            }
        }
        return notice;
    }

    function setAuthNotice(message, isError = false) {
        const notice = getAuthNoticeEl();
        if (!message) {
            notice.hidden = true;
            notice.textContent = '';
            notice.classList.remove('is-error');
            return;
        }

        notice.hidden = false;
        notice.textContent = message;
        notice.classList.toggle('is-error', isError);
    }

    function decodeJwtPayload(token) {
        try {
            const payload = token.split('.')[1];
            const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
            const decoded = atob(normalized);
            return JSON.parse(decoded);
        } catch (error) {
            console.warn('[auth] Could not decode Google token payload', error);
            return null;
        }
    }

    function finishGoogleAuth(profile, credential) {
        const user = {
            provider: 'google',
            name: profile?.name || 'Google user',
            email: profile?.email || 'google-user@example.com',
            picture: profile?.picture || '',
        };

        localStorage.setItem('inigosyncUser', JSON.stringify(user));
        localStorage.setItem('inigosyncToken', credential || 'google-demo-token');

        setAuthNotice('Google sign-in completed. Redirecting to your dashboard…');
        const redirectUrl = new URL('../Pages/user_dashboard.html', window.location.href);
        window.location.assign(redirectUrl.toString());
    }

    function handleGoogleCredential(response) {
        if (!response?.credential) {
            setAuthNotice('Google sign-in was cancelled. Please try again.', true);
            return;
        }

        setAuthNotice('Signing you in with Google…');
        const buttons = overlay.querySelectorAll('[data-google-btn] button');
        buttons.forEach((button) => {
            button.disabled = true;
            button.classList.add('is-loading');
        });

        const profile = decodeJwtPayload(response.credential);

        fetch(GOOGLE_AUTH_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        })
            .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data?.message || 'Unable to finish Google sign-in.');
                }
                return data;
            })
            .then((data) => {
                const user = data?.user || {
                    provider: 'google',
                    name: profile?.name || 'Google user',
                    email: profile?.email || 'google-user@example.com',
                    picture: profile?.picture || '',
                };

                localStorage.setItem('inigosyncUser', JSON.stringify(user));
                if (data?.token) {
                    localStorage.setItem('inigosyncToken', data.token);
                }

                setAuthNotice(data?.message || 'Google sign-in completed. Redirecting to your dashboard…');

                if (data?.redirectTo) {
                    window.location.assign(data.redirectTo);
                    return;
                }

                const redirectUrl = new URL('../Pages/user_dashboard.html', window.location.href);
                window.location.assign(redirectUrl.toString());
            })
            .catch((error) => {
                const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
                if (isLocalhost) {
                    finishGoogleAuth(profile, response.credential);
                    return;
                }

                setAuthNotice(error.message || 'Google sign-in failed. Please try again.', true);
            })
            .finally(() => {
                buttons.forEach((button) => {
                    button.disabled = false;
                    button.classList.remove('is-loading');
                });
            });
    }

    function handleGooglePromptNotification(notification) {
        if (!notification) return;

        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const reason = notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || 'Google did not display a sign-in prompt.';
            setAuthNotice(`Google sign-in was not shown. ${reason}`, true);
            return;
        }

        if (notification.isDismissedMoment()) {
            setAuthNotice('Google sign-in was closed. Please try again.', true);
        }
    }

    function renderGoogleButtons() {
        if (!window.google || !google.accounts || !google.accounts.id) return false;
        if (GOOGLE_CLIENT_ID.startsWith('YOUR_GOOGLE_CLIENT_ID')) {
            console.warn('[auth] Replace the placeholder Google client ID before signing in for real.');
        }

        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredential,
            ux_mode: 'popup',
            auto_select: false,
            cancel_on_tap_outside: false
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
                    google.accounts.id.prompt((notification) => {
                        handleGooglePromptNotification(notification);
                    });
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