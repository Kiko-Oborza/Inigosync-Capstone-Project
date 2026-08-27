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

    // ------------------------------------------------------------------
    // Forgot / Reset password — Supabase redirects the visitor back here
    // after they click the link in the reset email, with `type=recovery`
    // in the URL and a short-lived (but real) session already established
    // for that user. Checked directly against the URL — not only via the
    // PASSWORD_RECOVERY auth event below — because the Supabase client's
    // own URL parsing can finish before this script gets a chance to
    // subscribe to that event; missing it would silently drop the visitor
    // into the auto-redirect further down instead of letting them set a
    // new password. See the mode === 'reset' submit handler below for
    // where the new password is actually set.
    // ------------------------------------------------------------------
    const isRecoveryRedirect = /type=recovery/.test(window.location.hash) || /type=recovery/.test(window.location.search);
    let recoveryHandled = false;

    function enterRecoveryMode() {
        if (recoveryHandled) return;
        recoveryHandled = true;
        if (window.InigoLoading) window.InigoLoading.hide();
        openModal('reset');
    }

    if (window.sb) {
        window.sb.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') enterRecoveryMode();
        });
    }

    if (isRecoveryRedirect) enterRecoveryMode();

    // Google's OAuth flow is a full-page redirect away and back — there's no
    // in-page callback to hook into. So on every load of this page, check
    // whether a session already exists (true right after that redirect
    // returns) and route straight into the dashboard. Errors are swallowed
    // rather than shown, since landing here isn't something the visitor
    // actively did — e.g. a stale non-customer session shouldn't surface a
    // toast on an otherwise ordinary page load.
    //
    // The loading overlay should only appear for a genuine "just came back
    // from Google" trip — not for an ordinary revisit where a session
    // happens to already exist (e.g. the landing page is still open in a
    // tab) — otherwise every plain page load with a lingering session would
    // flash a full-page blur for no reason the visitor asked for.
    const isOauthReturn = sessionStorage.getItem('inigosync-oauth-pending') === '1';
    sessionStorage.removeItem('inigosync-oauth-pending');

    if (window.sb) {
        window.sb.auth.getSession().then(({ data: { session } }) => {
            // A recovery-link session must NOT auto-complete a normal
            // login — it exists only so mode === 'reset' below can call
            // updateUser(); routing it into completeLogin() would skip
            // straight past "set a new password" into the dashboard.
            if (!session || isRecoveryRedirect || recoveryHandled) return;
            if (isOauthReturn && window.InigoLoading) window.InigoLoading.show('Signing you in…');
            completeLogin(['customer']).catch(() => {
                if (window.InigoLoading) window.InigoLoading.hide();
            });
        });
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

        // Customers can switch between Log In / Sign Up, but Admin, Verify,
        // Forgot, and Reset are all one-off steps reached from elsewhere —
        // hide the tab bar while any of them is active.
        if (authTabsEl) {
            authTabsEl.hidden = name === 'admin' || name === 'verify' || name === 'forgot' || name === 'reset';
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

    // Rewrites raw Supabase Auth error text into copy a user can act on.
    // The rate-limit and email-not-confirmed cases are the ones that came up
    // while diagnosing the OTP email issue — Supabase's built-in mailer caps
    // out fast during repeated signups, and the raw messages ("429: email
    // rate limit exceeded") don't tell the user what to actually do.
    function friendlyAuthError(err) {
        const code = err?.code || '';
        const message = err?.message || '';

        if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
            const waitMatch = message.match(/after (\d+) seconds/i);
            return waitMatch
                ? `Too many attempts — please wait ${waitMatch[1]}s and try again.`
                : 'Too many attempts — please wait a minute and try again.';
        }

        if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
            return 'Please verify your email before logging in — check your inbox to confirm your account.';
        }

        return message || 'Something went wrong. Please try again.';
    }

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
                    if (window.InigoLoading) window.InigoLoading.show('Signing you in…');
                    const { error } = await window.sb.auth.signInWithPassword({
                        email: data.email,
                        password: data.password
                    });
                    if (error) throw error;
                    await completeLogin(['customer']);
                    return;
                }

                if (mode === 'signup') {
                    // PH mobile validation (spec: registration must validate
                    // the mobile number). Normalized to the local
                    // 09XXXXXXXXX form regardless of which accepted format
                    // was typed, so contact_num is stored one consistent way.
                    const mobileCheck = window.validatePhMobile(data.mobile);
                    if (!mobileCheck.valid) {
                        setAuthNotice(mobileCheck.message, true);
                        return;
                    }

                    const { data: signUpData, error } = await window.sb.auth.signUp({
                        email: data.email,
                        password: data.password,
                        options: {
                            data: {
                                full_name: data.fullname,
                                contact_num: mobileCheck.normalized
                            }
                        }
                    });
                    if (error) throw error;

                    // Supabase returns no error and no session for an email that's
                    // already registered — it just silently no-ops (anti-enumeration
                    // behavior) instead of throwing. An empty identities array is the
                    // one signal that distinguishes this from a genuine new signup.
                    if (signUpData.user && signUpData.user.identities && signUpData.user.identities.length === 0) {
                        setAuthNotice('An account with this email already exists. Please log in instead.', true);
                        return;
                    }

                    if (signUpData.session) {
                        // Email confirmation is turned off for this project —
                        // signUp already returned a live session.
                        if (window.InigoLoading) window.InigoLoading.show('Setting up your dashboard…');
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

                    if (window.InigoLoading) window.InigoLoading.show('Verifying…');
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
                    if (window.InigoLoading) window.InigoLoading.show('Signing you in…');
                    const { error } = await window.sb.auth.signInWithPassword({
                        email: data['admin-email'],
                        password: data['admin-password']
                    });
                    if (error) throw error;
                    await completeLogin(['staff', 'admin']);
                    return;
                }

                if (mode === 'forgot') {
                    // Deliberately vague success message regardless of
                    // whether the email is registered — resetPasswordForEmail
                    // itself doesn't error for an unknown email either, to
                    // avoid letting this form be used to enumerate accounts.
                    const redirectTo = `${window.location.origin}${window.location.pathname}`;
                    const { error } = await window.sb.auth.resetPasswordForEmail(data.email, { redirectTo });
                    if (error) throw error;
                    setAuthNotice("If that email is registered, we've sent a password reset link. Check your inbox.", false);
                    form.reset();
                    return;
                }

                if (mode === 'reset') {
                    const newPassword = data['new-password'];
                    const confirmPassword = data['confirm-password'];
                    if (newPassword !== confirmPassword) {
                        setAuthNotice('Passwords do not match.', true);
                        return;
                    }
                    const { error } = await window.sb.auth.updateUser({ password: newPassword });
                    if (error) throw error;
                    // Sign out of the short-lived recovery session so the
                    // visitor logs back in fresh with the new password —
                    // simpler and safer than guessing which dashboard a
                    // recovery link belongs on (this modal serves customer,
                    // staff, and admin accounts alike).
                    await window.sb.auth.signOut();
                    form.reset();
                    setActivePanel('login');
                    setAuthNotice('Password updated — please log in with your new password.', false);
                    return;
                }
            } catch (err) {
                if (window.InigoLoading) window.InigoLoading.hide();
                setAuthNotice(friendlyAuthError(err), true);
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
                setAuthNotice(friendlyAuthError(error), true);
                otpResendBtn.disabled = false;
                return;
            }
            startResendCountdown(30);
        });
    }

    // Short-lived toast: floats above the modal instead of sitting inline in
    // the form flow, and auto-dismisses on its own — no close button needed.
    let authNoticeDismissTimer = null;
    let authNoticeHideTimer = null;

    function getAuthNoticeEl() {
        let notice = overlay.querySelector('[data-auth-notice]');
        if (!notice) {
            notice = document.createElement('p');
            notice.className = 'auth-status';
            notice.dataset.authNotice = '';
            notice.setAttribute('aria-live', 'polite');
            notice.hidden = true;
            overlay.appendChild(notice);
        }
        return notice;
    }

    function hideAuthNotice() {
        const notice = getAuthNoticeEl();
        notice.classList.remove('is-visible');
        if (authNoticeHideTimer) window.clearTimeout(authNoticeHideTimer);
        authNoticeHideTimer = window.setTimeout(() => {
            notice.hidden = true;
        }, 250);
    }

    function setAuthNotice(message, isError = false, duration = isError ? 5000 : 3500) {
        const notice = getAuthNoticeEl();
        if (authNoticeDismissTimer) {
            window.clearTimeout(authNoticeDismissTimer);
            authNoticeDismissTimer = null;
        }
        if (authNoticeHideTimer) {
            window.clearTimeout(authNoticeHideTimer);
            authNoticeHideTimer = null;
        }

        if (!message) {
            hideAuthNotice();
            return;
        }

        notice.hidden = false;
        notice.textContent = message;
        notice.classList.toggle('is-error', isError);
        requestAnimationFrame(() => notice.classList.add('is-visible'));

        authNoticeDismissTimer = window.setTimeout(hideAuthNotice, duration);
    }

    // ------------------------------------------------------------------
    // Google Sign-In / Sign-Up — via Supabase's native Google OAuth
    // provider (Authentication → Sign In / Providers → Google in the
    // Supabase dashboard). Customer accounts only — the Admin and Verify
    // panels stay credential-only on purpose, so no Google button is
    // rendered there. Clicking the button hands off to a full-page
    // redirect (Google, then back here); there is no in-page response to
    // handle, so the click handler only needs to cover the case where the
    // redirect itself fails to start.
    // ------------------------------------------------------------------
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

        button.addEventListener('click', async () => {
            if (!window.sb) {
                setAuthNotice('Unable to reach the server right now. Please try again shortly.', true);
                return;
            }

            button.disabled = true;
            button.classList.add('is-loading');
            if (window.InigoLoading) window.InigoLoading.show('Redirecting to Google…');
            sessionStorage.setItem('inigosync-oauth-pending', '1');

            const { error } = await window.sb.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.href }
            });

            if (error) {
                sessionStorage.removeItem('inigosync-oauth-pending');
                if (window.InigoLoading) window.InigoLoading.hide();
                setAuthNotice(friendlyAuthError(error), true);
                button.disabled = false;
                button.classList.remove('is-loading');
            }
            // On success the browser navigates away to Google, so there's
            // nothing further to do here — the redirect back is handled by
            // the session check at the top of this file.
        });

        container.appendChild(button);
    });
});