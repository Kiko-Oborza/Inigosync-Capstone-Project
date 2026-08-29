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
//
// Sign Up is a three-step flow (email → password → name/mobile/terms) that
// lives inside a single <form>: the steps are containers this file shows and
// hides, never separate forms, so FormData still collects every field in one
// go and the submit path below is the same one it always was. See the
// "Sign Up — stepped flow" section, and the password policy above it, which
// applies to Sign Up and Reset Password only — never to Log In.

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector('[data-auth-overlay]');
    if (!overlay) return;

    const modal = overlay.querySelector('.auth-modal');
    const authTabsEl = overlay.querySelector('[data-auth-tabs]');
    const tabs = overlay.querySelectorAll('[data-auth-tab]');
    // Descendant query, so the .auth-panel-stack wrapper that now holds the
    // Log In and Sign Up panels (see Pages/Index.html) is transparent here —
    // all six panels are still found, in document order.
    const panels = overlay.querySelectorAll('[data-auth-panel]');
    const panelStack = overlay.querySelector('[data-auth-panel-stack]');

    // Sign Up is a three-step flow inside that one <form> (see Pages/Index.html).
    // Queried here, at the top, rather than beside the step wiring further
    // down: setActivePanel() resets the flow, and setActivePanel already runs
    // during this setup function (recovery redirect / forced-sign-out notice),
    // so anything it touches has to be initialised before that point or it is
    // a temporal-dead-zone ReferenceError waiting for the right entry path.
    const signupForm = overlay.querySelector('[data-auth-panel="signup"]');
    const signupStepEls = signupForm ? Array.from(signupForm.querySelectorAll('[data-signup-step]')) : [];
    const signupIndicator = signupForm ? signupForm.querySelector('[data-signup-indicator]') : null;
    const signupDots = signupForm ? Array.from(signupForm.querySelectorAll('[data-signup-dot]')) : [];
    // Every [data-password-policy] block on the page (Sign Up step 2 and the
    // Reset Password panel), filled in by the wiring block further down.
    const passwordPolicyGroups = [];
    let signupStep = 1;

    let lastFocusedEl = null;
    let pendingSignupEmail = '';
    // Set while a password login is gated behind a first-login-per-device
    // OTP check (see gateOtpThenCompleteLogin below); null the rest of the
    // time, including throughout the post-signup verify flow.
    let pendingLoginOtp = null;
    // Which verifyOtp() call — and which follow-up action — the Verify
    // panel's submit handler should perform: 'signup' (default, existing
    // post-sign-up behavior) or 'login' (new-device gate). See
    // setOtpPurpose() below, which also relabels the reused panel's copy.
    let otpPurpose = 'signup';

    // Timers for the short-lived toast setAuthNotice() renders further down.
    //
    // Declared HERE rather than beside setAuthNotice, and that is the whole
    // point of them being here: consumePendingAuthNotice() runs during this
    // same setup pass and calls setAuthNotice(), so while these two lived
    // ~1000 lines below that call they were read inside their temporal dead
    // zone and threw `ReferenceError: Cannot access 'authNoticeDismissTimer'
    // before initialization`. That threw out of the DOMContentLoaded handler
    // itself, so everything after it never ran — no close handler, no tab
    // switching, no submit handlers, no Google button. The modal was dead,
    // and only on the paths that reach that call (the authGuard.js
    // idle-timeout / superseded-session notice), which is why it went
    // unnoticed. See assertEarlySetupBindings() below, which is the guard
    // that keeps this from silently coming back.
    let authNoticeDismissTimer = null;
    let authNoticeHideTimer = null;

    // Whether the auth modal is currently open, for the focus trap in the
    // keydown handler below. Tracked as a flag rather than derived from
    // overlay[hidden], which is only cleared once the 250ms fade-out finishes:
    // closeModal() hands focus back to the trigger immediately, so a Tab
    // during that window must not be dragged back into a closing dialog. Same
    // shape, and same reasoning, as the Terms dialog's `termsIsOpen`.
    let authIsOpen = false;

    const DASHBOARD_BY_ROLE = {
        customer: 'user_dashboard.html',
        staff: 'staff_dashboard.html',
        admin: 'owner_dashboard.html'
    };

    // Per-user (not per-browser) localStorage markers — see this repo's
    // Phase 6 report for the full reasoning behind each:
    //   trusted-device : has this account completed a full login on this
    //                    browser before? Skips the new-device OTP gate.
    //                    Deliberately NEVER cleared on sign-out — that is
    //                    the point of "first login per device", not
    //                    "first login per session". Scoped per user id so
    //                    a device trusted for one account never lets a
    //                    different account on the same browser skip its
    //                    own first OTP.
    //   session-token   : this browser's current session id, for Single
    //                    Session enforcement. MUST match the identically
    //                    named literal in includes/authGuard.js, which
    //                    only ever reads it (this file is the only writer).
    const TRUSTED_DEVICE_STORAGE_PREFIX = 'inigosync-trusted-device:';
    const SESSION_TOKEN_STORAGE_PREFIX = 'inigosync-session-token:';
    // One-shot reason left behind by includes/authGuard.js right before it
    // forces a sign-out (idle timeout / superseded by another device) and
    // redirects here. MUST match the identically named literal there.
    const AUTH_NOTICE_STORAGE_KEY = 'inigosync-auth-notice';

    // ------------------------------------------------------------------
    // Password policy — CREATION TIME ONLY.
    //
    // Enforced in the two places a password is chosen: Sign Up step 2 and
    // the Reset Password panel. Deliberately NOT enforced on Log In or
    // Admin login: accounts created before this rule existed have weaker
    // passwords and must keep signing in. Reset carries the same rule as
    // signup on purpose — otherwise "forgot password" would be a way to
    // set a password that signup itself would have refused.
    //
    // The minlength/maxlength attributes in Pages/Index.html mirror these
    // numbers, and the checklist in the modal renders these same rules,
    // but neither is trusted: checkPasswordPolicy() is re-run on submit
    // against the raw value, so nothing depends on the state of the UI.
    // ------------------------------------------------------------------
    const PASSWORD_MIN_LENGTH = 8;
    const PASSWORD_MAX_LENGTH = 15;
    // Printable ASCII that is neither a letter nor a digit. Spelled out as
    // an explicit set rather than /[^A-Za-z0-9]/ so the rule is
    // predictable: with the negated class, an accented letter typed on a
    // non-US keyboard would silently satisfy "1 special character".
    const PASSWORD_SPECIAL_PATTERN = /[ !"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
    const PASSWORD_RULES = [
        { id: 'length', test: (value) => value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH },
        { id: 'upper', test: (value) => /[A-Z]/.test(value) },
        { id: 'lower', test: (value) => /[a-z]/.test(value) },
        { id: 'number', test: (value) => /[0-9]/.test(value) },
        { id: 'special', test: (value) => PASSWORD_SPECIAL_PATTERN.test(value) }
    ];

    // Returns { valid, failed: [ruleId] }. Never throws, and treats a
    // missing/non-string value as an empty password rather than as valid.
    function checkPasswordPolicy(value) {
        const password = typeof value === 'string' ? value : '';
        const failed = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.id);
        return { valid: failed.length === 0, failed };
    }

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

        // Single Session + device trust — both best-effort, and never
        // allowed to block a login that has already passed every check
        // above. See registerActiveSession()'s own comment for the
        // graceful-degradation contract this relies on when
        // database/schema/005_session_security.sql hasn't been run yet.
        await registerActiveSession(session.user.id);
        markDeviceTrusted(session.user.id);

        closeModal();
        const redirectUrl = new URL(DASHBOARD_BY_ROLE[profile.role], window.location.href);
        window.location.assign(redirectUrl.toString());
    }

    // ------------------------------------------------------------------
    // Single Session (spec) — upsert this browser's session id as the
    // signed-in user's one active session, on every successful login of
    // every kind (customer, Google, admin/staff panel). Deliberately
    // swallows every failure (missing table, RLS, network) instead of
    // surfacing it: this is defense-in-depth layered on top of a login
    // that has already succeeded, never a precondition for one. On
    // failure, no local token is stored either, so
    // includes/authGuard.js's own periodic check later finds nothing to
    // compare against for this user and stays fully inert — see that
    // file's checkSessionSupersession() comment for the other half of
    // this contract.
    // ------------------------------------------------------------------
    async function registerActiveSession(userId) {
        if (!window.sb) return;

        const sessionToken = (window.crypto && typeof window.crypto.randomUUID === 'function')
            ? window.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const nowIso = new Date().toISOString();

        try {
            const { error: upsertError } = await window.sb.from('active_session').upsert({
                user_id: userId,
                session_token: sessionToken,
                device_label: (navigator.userAgent || '').slice(0, 120),
                created_at: nowIso,
                last_seen_at: nowIso
            }, { onConflict: 'user_id' });

            // `active_session` not migrated yet (see
            // database/schema/005_session_security.sql), or some other
            // RLS/network issue — single-session enforcement silently
            // no-ops. Deliberately do NOT store a local token in this
            // case, so includes/authGuard.js also treats this device as
            // "not participating" instead of comparing against a table
            // that was never actually written.
            if (upsertError) return;

            localStorage.setItem(SESSION_TOKEN_STORAGE_PREFIX + userId, sessionToken);
        } catch (_) {
            // Never let this break login.
        }
    }

    // ------------------------------------------------------------------
    // First-login-per-device OTP gate (spec: Email Authentication, scoped
    // to first-login-per-device per the owner's decision — see
    // implementation_plan.md's D6 / "Owner decisions"). These two
    // functions are the only place trusted-device state is read/written.
    // ------------------------------------------------------------------
    function isDeviceTrusted(userId) {
        try {
            return localStorage.getItem(TRUSTED_DEVICE_STORAGE_PREFIX + userId) === '1';
        } catch (_) {
            // Can't remember anything — the safe default is to ask for an
            // OTP rather than silently skip it forever.
            return false;
        }
    }

    function markDeviceTrusted(userId) {
        try {
            localStorage.setItem(TRUSTED_DEVICE_STORAGE_PREFIX + userId, '1');
        } catch (_) {
            // Best-effort only — if storage is unavailable, this account
            // is simply asked for an OTP again next time too.
        }
    }

    // Relabels the reused Verify panel for whichever purpose it's
    // currently serving, so "Verify your email" / "← Back to sign up"
    // (correct right after Sign Up) don't show while this same panel is
    // instead gating a password login on a new device.
    function setOtpPurpose(purpose) {
        otpPurpose = purpose;
        const heading = overlay.querySelector('[data-verify-heading]');
        if (heading) heading.textContent = purpose === 'login' ? "Confirm it's you" : 'Verify your email';
        const backLink = overlay.querySelector('[data-otp-back-link]');
        if (backLink) {
            backLink.dataset.authTab = purpose === 'login' ? 'login' : 'signup';
            backLink.textContent = purpose === 'login' ? '← Back to log in' : '← Back to sign up';
        }
    }

    // Called right after a password sign-in succeeds (Log In or Admin
    // panel alike). A Supabase session already exists at this point —
    // signInWithPassword already fully established it — so this only
    // gates *completing the app-level login* (closing the modal and
    // redirecting into a dashboard), the same trust model the role gate
    // in completeLogin() above already relies on (sign back out and
    // refuse to proceed on failure). See this repo's Phase 6 report for
    // the accepted limitation that this does not stop someone with
    // devtools open from navigating straight to a dashboard URL using the
    // session that already exists before finishing this step.
    async function gateOtpThenCompleteLogin(user, allowedRoles, email) {
        if (!user || isDeviceTrusted(user.id)) {
            await completeLogin(allowedRoles);
            return;
        }

        pendingLoginOtp = { userId: user.id, email, allowedRoles };
        setOtpPurpose('login');

        if (window.InigoLoading) window.InigoLoading.hide();

        const { error } = await window.sb.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false }
        });
        if (error) {
            pendingLoginOtp = null;
            throw error;
        }

        const emailLabel = overlay.querySelector('[data-verify-email]');
        if (emailLabel) emailLabel.textContent = email || 'your email';
        setActivePanel('verify');
        startOtpFlow();
        setAuthNotice('New device — enter the 6-digit code we emailed you to finish signing in.', false);
    }

    // ------------------------------------------------------------------
    // Early-setup binding guard  (regression guard for the TDZ defect)
    //
    // Everything below this line runs while the page is still being set up:
    // enterRecoveryMode() on a ?type=recovery return, and
    // consumePendingAuthNotice() on the authGuard.js forced-sign-out return.
    // Both reach openModal() / setActivePanel() / setAuthNotice(), and those
    // read module-scope `let`/`const` bindings. Reading one of those before
    // its declaration line has executed throws ReferenceError, and because
    // these calls sit directly in the DOMContentLoaded handler, that
    // ReferenceError aborts the entire rest of setup — the modal loses its
    // close handler, its tabs, its submit handlers and its Google button. It
    // only fires on those two entry paths, so ordinary loads look fine and
    // the breakage hides.
    //
    // This probe reads each of those bindings on EVERY load, so a declaration
    // that drifts back below this point stops being a silent, path-dependent
    // dead modal and becomes a console error on every single page load, in
    // every browser and every automated run. Each is read through its own
    // thunk so the message can name the binding that moved; a bare
    // `void [a, b]` would stop at the first one.
    //
    // `typeof` is deliberately not used to probe: on a `let` still in its
    // temporal dead zone `typeof` throws too, which is exactly the signal
    // wanted here — but it would make the intent read as a feature check.
    //
    // Keep this list in sync with what the early-setup calls actually touch.
    // Anything added to openModal / setActivePanel / setAuthNotice /
    // resetSignupFlow belongs here too.
    // ------------------------------------------------------------------
    function assertEarlySetupBindings() {
        const probes = [
            ['authNoticeDismissTimer', () => authNoticeDismissTimer],
            ['authNoticeHideTimer', () => authNoticeHideTimer],
            ['authIsOpen', () => authIsOpen],
            ['lastFocusedEl', () => lastFocusedEl],
            ['pendingLoginOtp', () => pendingLoginOtp],
            ['otpPurpose', () => otpPurpose],
            ['signupStep', () => signupStep],
            ['signupStepEls', () => signupStepEls],
            ['signupDots', () => signupDots],
            ['signupIndicator', () => signupIndicator],
            ['passwordPolicyGroups', () => passwordPolicyGroups],
            ['authTabsEl', () => authTabsEl],
            ['panelStack', () => panelStack],
            ['tabs', () => tabs],
            ['panels', () => panels],
            ['modal', () => modal]
        ];

        probes.forEach(([name, read]) => {
            try {
                read();
            } catch (err) {
                // Not rethrown: this guard exists to make the ordering break
                // visible, not to add a second way for setup to die.
                console.error(
                    `[auth.js] "${name}" is declared BELOW the early-setup calls that read it. ` +
                    'Move its declaration up into the top-level block beside `signupStep` / ' +
                    '`lastFocusedEl`. Until then the auth modal is dead (no close button, no ' +
                    'tabs, no submit, no Google button) on the password-recovery and ' +
                    'idle-logout entry paths.',
                    err
                );
            }
        });
    }

    assertEarlySetupBindings();

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

    // A forced sign-out from includes/authGuard.js (idle timeout, or this
    // account signing in on another device) leaves a one-shot reason
    // behind in sessionStorage before it redirects here — surface it with
    // the same notice mechanism (setAuthNotice) used everywhere else in
    // this modal. Never let it preempt an in-progress password-recovery
    // flow, which takes priority above.
    const AUTH_NOTICE_MESSAGES = {
        idle: 'You were signed out after a period of inactivity. Please log in again.',
        superseded: 'You were signed out because your account was signed in on another device.'
    };

    function consumePendingAuthNotice() {
        let reason = null;
        try {
            reason = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY);
            if (reason) sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
        } catch (_) {
            return;
        }
        const message = reason && AUTH_NOTICE_MESSAGES[reason];
        if (!message) return;
        openModal('login');
        setAuthNotice(message, false);
    }

    if (!isRecoveryRedirect) consumePendingAuthNotice();

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
        // Switching to any panel OTHER than 'verify' while a login-OTP gate
        // is pending means the visitor backed out via the "← Back to log
        // in" link (or any other tab) instead of closing the modal —
        // closeModal() only catches the "closed the whole modal" case, so
        // this covers "switched panels within it" too. The real Supabase
        // session from the password sign-in that started the gate is still
        // active in this case; sign it back out here as well so it isn't
        // left authenticated-but-not-actually-"logged in".
        if (pendingLoginOtp && otpPurpose === 'login' && name !== 'verify') {
            window.sb.auth.signOut().catch(() => {});
            pendingLoginOtp = null;
        }

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

        // The stepped Sign Up flow always opens on step 1. Covers every way
        // back into it — reopening the modal, the Log In tab and back, or the
        // Verify panel's "← Back to sign up" — so nobody lands mid-flow on a
        // step with a stale error still showing under a field they cannot see.
        if (name === 'signup') resetSignupFlow();

        // Customers can switch between Log In / Sign Up, but Admin, Verify,
        // Forgot, and Reset are all one-off steps reached from elsewhere —
        // hide the tab bar while any of them is active.
        const isTabbedPanel = name === 'login' || name === 'signup';
        if (authTabsEl) {
            authTabsEl.hidden = !isTabbedPanel;
        }

        // Log In and Sign Up sit in one shared grid cell so the taller of the
        // two fixes the card height (see .auth-panel-stack in Style/Auth.css).
        // The inactive one is visibility:hidden, which means it still occupies
        // that cell — so while a one-off panel is showing, the whole wrapper
        // has to come out of flow or it would pad the card to sign-up height.
        if (panelStack) {
            panelStack.hidden = !isTabbedPanel;
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
        authIsOpen = true;
        if (panelName) setActivePanel(panelName);

        const activePanel = overlay.querySelector('.auth-form.is-active');
        const firstField = activePanel && activePanel.querySelector('input');
        if (firstField) firstField.focus();
    }

    function closeModal() {
        if (pendingLoginOtp) {
            // Backing out of the new-device OTP gate without finishing it.
            // A real Supabase session already exists at this point (see
            // gateOtpThenCompleteLogin) — sign it back out so it isn't
            // left authenticated-but-not-actually-"logged in" from the
            // app's point of view. Fire-and-forget: the modal closes
            // regardless of whether this network call succeeds.
            window.sb.auth.signOut().catch(() => {});
            pendingLoginOtp = null;
        }
        authIsOpen = false;
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

    // ------------------------------------------------------------------
    // Focus trap — shared by the auth modal and the Terms dialog
    //
    // One implementation for both so the two dialogs behave identically and,
    // more importantly, cooperate: the keydown handler below routes Tab to
    // whichever dialog is on top, so the trap never has to know about
    // stacking. (includes/landingPage.js's court viewer is the same shape
    // again, gated on its own `isOpen`; only one of the three is ever open.)
    //
    // The focusable set is recomputed on EVERY Tab, never cached at open
    // time. That is not defensiveness — in this modal it is required. The Log
    // In / Sign Up panels share one grid cell and the sign-up steps share
    // another, and in both cases the inactive member stays laid out and is
    // merely `visibility: hidden`; the one-off panels (Verify / Admin /
    // Forgot / Reset), the tab bar and the whole panel stack go
    // `display: none`. So which controls are tabbable changes on every tab
    // switch and every Continue / Back, and a set captured at open time would
    // already be wrong by the first click.
    // ------------------------------------------------------------------
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // FOCUSABLE matches on markup alone, which is not enough here: the
    // inactive panels and steps are still in the DOM and still match it. Both
    // checks are needed and neither subsumes the other —
    //   • `visibility: hidden` still generates boxes, so it has to be read off
    //     the computed style. visibility is inherited, so this correctly
    //     reports 'hidden' for a control inside a hidden panel or step.
    //   • `display: none` generates no boxes at all, and computed visibility
    //     on such an element still reads 'visible', so it is caught by the
    //     absence of client rects instead.
    // `[disabled]` is already excluded by the selector, which is what keeps the
    // OTP resend button out of the rotation while its countdown is running.
    function isRenderedFocusable(el) {
        if (el.getClientRects().length === 0) return false;
        return window.getComputedStyle(el).visibility !== 'hidden';
    }

    function focusablesWithin(container) {
        return Array.from(container.querySelectorAll(FOCUSABLE)).filter(isRenderedFocusable);
    }

    // Wraps Tab / Shift+Tab around `container`. `fallback` takes focus when
    // there is nothing focusable inside (the Terms dialog carries
    // tabindex="-1" for exactly that); pass null to just swallow the Tab.
    // An active element outside the container is pulled back in, which is what
    // recovers focus after the browser drops it to <body> — switching tabs
    // blurs whatever was focused in the panel that just became hidden.
    function trapTab(e, container, fallback) {
        const focusables = focusablesWithin(container);
        if (focusables.length === 0) {
            e.preventDefault();
            if (fallback) fallback.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || active === container || !container.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !container.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    }

    // ------------------------------------------------------------------
    // Terms & Conditions dialog
    //
    // The Sign Up checkbox's "Terms & Conditions" link used to open
    // Pages/terms.html in a new tab, which threw away a half-filled
    // registration form. It now opens an in-page dialog stacked on top of
    // this modal instead.
    //
    // The copy is NOT duplicated into the markup — a legal document with two
    // sources of truth is a defect waiting to happen. Pages/terms.html is
    // fetched once on first open, its .terms-content container is lifted out,
    // and the result is cached for the rest of the page's life. That page
    // stays exactly as it is: it is still linked from elsewhere, and it is
    // still this feature's fallback.
    //
    // Nesting contract with the auth modal (both are open at once):
    //   • Body scroll lock stays with the auth modal (body.auth-lock). This
    //     dialog never touches that class, so closing it cannot unlock the
    //     page behind a modal that is still open. Its own copy scrolls inside
    //     .auth-terms-body.
    //   • Escape and the Tab focus trap are taken over by this dialog while it
    //     is open (see the keydown handler below) and handed straight back on
    //     close, so Escape only ever closes the topmost dialog.
    //   • The auth overlay is marked aria-hidden while this is open, after
    //     focus has already moved into the dialog, so assistive tech sees one
    //     dialog at a time.
    // ------------------------------------------------------------------
    const TERMS_CLOSE_DELAY_MS = 250;

    const termsOverlay = document.querySelector('[data-terms-overlay]');
    const termsDialog = termsOverlay && termsOverlay.querySelector('[data-terms-dialog]');
    const termsBody = termsOverlay && termsOverlay.querySelector('[data-terms-body]');
    const termsLinks = overlay.querySelectorAll('[data-terms-open]');

    // Cached document fragment of the fetched terms copy, plus the one-way
    // latch that sends every later click straight to the plain-link fallback
    // once a fetch has failed.
    let termsFragment = null;
    let termsFetchFailed = false;
    let termsLastFocused = null;
    let termsHideTimer = null;
    // Tracked as a flag rather than derived from [hidden], which is only set
    // once the fade-out finishes: an Escape pressed during those 250ms belongs
    // to the auth modal underneath, not to a dialog already on its way out.
    // Same reasoning as the court viewer's own `isOpen` in landingPage.js.
    let termsIsOpen = false;

    function isTermsOpen() {
        return termsIsOpen;
    }

    // Fetches Pages/terms.html and resolves to a fragment of its
    // .terms-content children. Throws on anything that would leave the dialog
    // empty — network error, non-2xx, or a page whose structure no longer
    // matches — so the caller can fall back to opening the page in a tab.
    async function loadTermsFragment(sourceUrl) {
        if (termsFragment) return termsFragment;

        const response = await fetch(sourceUrl, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`terms.html responded ${response.status}`);

        // Parsed with DOMParser into an inert document — NOT matched with a
        // regex, and never handed to innerHTML. The nodes are then imported
        // into this document, so the browser's own parser is the only thing
        // that ever interprets the markup and no HTML string is re-parsed on
        // this side. This is same-origin, in-repo, developer-authored content
        // (Pages/terms.html), not user input, so there is nothing here for
        // escapeHtml to escape — escapeHtml exists for the opposite case,
        // untrusted values being interpolated into an HTML string.
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const source = parsed.querySelector('.terms-content');
        if (!source) throw new Error('terms.html has no .terms-content container');

        const imported = document.importNode(source, true);

        // Belt and braces. DOMParser output is inert and .terms-content holds
        // no scripts today, but nothing should be able to smuggle one in via
        // a later edit to that page.
        imported.querySelectorAll('script').forEach((el) => el.remove());

        // The dialog has its own sticky header carrying the title, so drop the
        // page's "Legal" eyebrow and its <h1> to avoid showing the heading
        // twice. Page furniture only — not one word of the policy text is
        // altered. Guarded: if terms.html ever loses them, nothing happens.
        imported.querySelectorAll('.eyebrow, .section-title').forEach((el) => el.remove());

        const fragment = document.createDocumentFragment();
        while (imported.firstChild) fragment.appendChild(imported.firstChild);

        termsFragment = fragment;
        return termsFragment;
    }

    // `returnFocusTo` is the element close() should hand focus back to — the
    // Terms link itself, passed explicitly rather than read off
    // document.activeElement. A mouse click on an <a> focuses it in Chrome but
    // not in every engine, and a programmatic .click() never does, so reading
    // the active element would sometimes drop focus to <body> on close.
    function openTermsDialog(returnFocusTo) {
        if (!termsOverlay || !termsDialog) return;

        termsLastFocused = returnFocusTo || document.activeElement;

        if (termsHideTimer) {
            window.clearTimeout(termsHideTimer);
            termsHideTimer = null;
        }

        termsOverlay.hidden = false;
        // Synchronous layout flush so the opacity:0 / display:flex state is
        // committed before [data-open] flips it — same reason as the court
        // viewer in includes/landingPage.js.
        void termsOverlay.offsetWidth;
        termsOverlay.setAttribute('data-open', '');
        termsIsOpen = true;

        // Focus first, aria-hidden second: marking an ancestor of the focused
        // element aria-hidden is exactly the bug this ordering avoids.
        termsDialog.focus();
        overlay.setAttribute('aria-hidden', 'true');
    }

    function closeTermsDialog() {
        if (!termsIsOpen) return;
        termsIsOpen = false;

        overlay.removeAttribute('aria-hidden');
        termsOverlay.removeAttribute('data-open');

        if (termsHideTimer) window.clearTimeout(termsHideTimer);
        termsHideTimer = window.setTimeout(() => {
            termsOverlay.hidden = true;
            termsHideTimer = null;
        }, TERMS_CLOSE_DELAY_MS);

        // Back to the link that opened this, with the sign-up form and every
        // value in it exactly as it was left — nothing is reset or re-rendered.
        if (termsLastFocused && typeof termsLastFocused.focus === 'function' && document.contains(termsLastFocused)) {
            termsLastFocused.focus();
        }
        termsLastFocused = null;
    }

    if (termsOverlay && termsDialog && termsBody) {
        termsOverlay.querySelectorAll('[data-terms-close]').forEach((el) => {
            el.addEventListener('click', closeTermsDialog);
        });

        termsLinks.forEach((link) => {
            link.addEventListener('click', async (e) => {
                // A previous attempt already failed: let the anchor's own
                // href/target="_blank" run, so the terms are still reachable.
                if (termsFetchFailed) return;

                e.preventDefault();

                try {
                    // link.href is the browser-resolved absolute URL, so this
                    // does not depend on where this script happens to live.
                    const fragment = await loadTermsFragment(link.href);
                    // Re-inserting the cached fragment moves its nodes, which
                    // empties it — so hand over a clone and keep the original.
                    termsBody.replaceChildren(fragment.cloneNode(true));
                    termsBody.scrollTop = 0;
                    openTermsDialog(link);
                } catch (err) {
                    // Never show an empty dialog. Fall back to the original
                    // new-tab behaviour and latch, so every later click skips
                    // straight to it.
                    console.warn('Terms dialog unavailable, opening terms.html in a new tab instead:', err);
                    termsFetchFailed = true;

                    // Deliberately NOT the 'noopener' feature string: with it,
                    // window.open returns null whether the popup opened or was
                    // blocked, so the blocked-popup branch below could not tell
                    // the two apart and fired on success. The opener reference
                    // is severed on the returned window instead — the anchor's
                    // own rel="noopener" does not cover a programmatic open.
                    const opened = window.open(link.href, '_blank');
                    if (opened) {
                        try {
                            opened.opener = null;
                        } catch (_) {
                            // Some engines refuse the assignment; the popup is
                            // our own same-origin page either way.
                        }
                    } else {
                        // Popup blocked — the click's user activation can lapse
                        // while the failing request is in flight. The next click
                        // is a fresh gesture and goes through the plain link
                        // above, which the blocker will not stop.
                        setAuthNotice('Could not open the Terms & Conditions here — tap the link again to open them in a new tab.', true);
                    }
                }
            });
        });
    }

    document.addEventListener('keydown', (e) => {
        // The Terms dialog stacks on top of this modal, so while it is open it
        // owns Escape and the Tab rotation and this modal ignores both.
        if (isTermsOpen()) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeTermsDialog();
                return;
            }

            if (e.key !== 'Tab') return;

            // Terms owns the rotation while it is on top; the auth modal's own
            // trap below is skipped by this `return`, so the two never fight
            // over the same Tab. Handing it back is just this branch stopping
            // to apply once termsIsOpen flips.
            trapTab(e, termsDialog, termsDialog);
            return;
        }

        if (e.key === 'Escape' && !overlay.hidden) {
            closeModal();
            return;
        }

        // Focus trap for the auth modal itself. Scoped to .auth-modal — the
        // role="dialog" element — rather than the overlay, whose only other
        // child is the pointer-events:none toast. Gated on `authIsOpen`, not
        // on overlay[hidden], which lags the close by the 250ms fade-out;
        // during that window focus is already back on the trigger and must
        // stay there.
        if (e.key === 'Tab' && authIsOpen) {
            trapTab(e, modal || overlay, null);
        }
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

    // ------------------------------------------------------------------
    // Live password checklist
    //
    // Renders checkPasswordPolicy() into every [data-password-policy] block
    // (Sign Up step 2, Reset Password). Presentation only — the enforcement
    // is the checkPasswordPolicy() call in the submit handler, which reads
    // the input's value and never looks at these classes.
    // ------------------------------------------------------------------
    function renderPasswordRules(group) {
        const { failed } = checkPasswordPolicy(group.input.value);
        group.items.forEach((item) => {
            const isMet = !failed.includes(item.dataset.passwordRule);
            item.classList.toggle('is-met', isMet);
            const state = item.querySelector('[data-password-rule-state]');
            // Visually hidden, so the tick is not the only thing carrying
            // "met" — a screen reader reads the state with the rule.
            if (state) state.textContent = isMet ? 'met' : 'not met';
        });
    }

    function syncPasswordRules() {
        passwordPolicyGroups.forEach(renderPasswordRules);
    }

    overlay.querySelectorAll('[data-password-policy]').forEach((groupEl) => {
        const input = groupEl.querySelector('[data-password-input]');
        const list = groupEl.querySelector('[data-password-rules]');
        if (!input || !list) return;

        const group = { input, items: Array.from(list.querySelectorAll('[data-password-rule]')) };
        passwordPolicyGroups.push(group);
        input.addEventListener('input', () => renderPasswordRules(group));
        renderPasswordRules(group);
    });

    // ------------------------------------------------------------------
    // Sign Up — stepped flow
    //
    // One <form>, three step containers stacked in a single grid cell (see
    // Pages/Index.html and .auth-step-stack in Style/Auth.css). Nothing here
    // touches the fields' name attributes, adds/removes controls, or
    // disables anything — a disabled control is dropped from FormData —
    // so the submit handler still sees exactly the same payload it always
    // did, and the OTP hand-off after it is untouched.
    // ------------------------------------------------------------------
    // Deliberately stricter than <input type="email">, which accepts
    // "a@b". Not a full RFC 5322 grammar (nothing short of the server is),
    // just enough to stop an obviously unusable address reaching step 2.
    const SIGNUP_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function setSignupStepError(step, message) {
        if (!signupForm) return;
        const el = signupForm.querySelector(`[data-signup-error="${step}"]`);
        if (el) el.textContent = message || '';
    }

    function clearSignupStepErrors() {
        signupStepEls.forEach((el) => setSignupStepError(el.dataset.signupStep, ''));
    }

    function setSignupStep(step, options) {
        const total = signupStepEls.length;
        if (!total) return;

        signupStep = Math.min(Math.max(step, 1), total);

        signupStepEls.forEach((el) => {
            el.classList.toggle('is-active', Number(el.dataset.signupStep) === signupStep);
        });
        signupDots.forEach((dot) => {
            const index = Number(dot.dataset.signupDot);
            dot.classList.toggle('is-current', index === signupStep);
            dot.classList.toggle('is-done', index < signupStep);
        });
        if (signupIndicator) signupIndicator.textContent = `Step ${signupStep} of ${total}`;

        if (options && options.focus) {
            const field = signupStepEls[signupStep - 1].querySelector('input');
            if (field) field.focus();
        }
    }

    function resetSignupFlow() {
        clearSignupStepErrors();
        setSignupStep(1);
        // Values are intentionally left alone (nothing here resets the
        // form), so the checklist has to be re-rendered against whatever is
        // still in the password field rather than assuming it is empty.
        syncPasswordRules();
    }

    // Returns null when the step's rules are satisfied, otherwise
    // { step, message } for the inline error on that step.
    function validateSignupStep(step) {
        if (!signupForm) return null;
        const fields = signupForm.elements;

        if (step === 1) {
            const value = (fields.email.value || '').trim();
            if (!value) return { step: 1, message: 'Enter your email address.' };
            if (!fields.email.checkValidity() || !SIGNUP_EMAIL_PATTERN.test(value)) {
                return { step: 1, message: 'Enter a valid email address.' };
            }
            return null;
        }

        if (step === 2) {
            if (!checkPasswordPolicy(fields.password.value).valid) {
                return { step: 2, message: 'Your password does not meet every requirement yet.' };
            }
            return null;
        }

        if (step === 3) {
            if (!(fields.fullname.value || '').trim()) {
                return { step: 3, message: 'Enter your full name.' };
            }
            // Same shared validator the submit handler runs before signUp —
            // called here only so the message lands inline on this step
            // instead of as a toast. The submit-side call stays exactly as
            // it was, since it is what normalises the number.
            // Guarded because this one runs OUTSIDE the submit handler's
            // try/catch: if includes/phoneValidation.js ever failed to load,
            // an unguarded call here would throw into a click handler and
            // dead-end the flow, where the submit-side call still surfaces it
            // as an error toast. Degrade to "let submit handle it".
            if (typeof window.validatePhMobile === 'function') {
                const mobileCheck = window.validatePhMobile(fields.mobile.value);
                if (!mobileCheck.valid) return { step: 3, message: mobileCheck.message };
            }
            if (!fields.terms.checked) {
                return { step: 3, message: 'Please accept the Terms & Conditions to continue.' };
            }
            return null;
        }

        return null;
    }

    // Submit-time gate: re-checks every step from the top, so a value that
    // was edited after its step was passed (or set straight on the DOM)
    // still cannot get through.
    function firstInvalidSignupStep() {
        for (let step = 1; step <= signupStepEls.length; step += 1) {
            const invalid = validateSignupStep(step);
            if (invalid) return invalid;
        }
        return null;
    }

    function advanceSignupStep() {
        const invalid = validateSignupStep(signupStep);
        if (invalid) {
            setSignupStepError(invalid.step, invalid.message);
            const field = signupStepEls[invalid.step - 1].querySelector('input');
            if (field) field.focus();
            return false;
        }
        setSignupStepError(signupStep, '');
        setSignupStep(signupStep + 1, { focus: true });
        return true;
    }

    if (signupForm) {
        signupForm.querySelectorAll('[data-signup-next]').forEach((btn) => {
            btn.addEventListener('click', () => advanceSignupStep());
        });

        signupForm.querySelectorAll('[data-signup-back]').forEach((btn) => {
            btn.addEventListener('click', () => {
                setSignupStepError(signupStep, '');
                setSignupStep(signupStep - 1, { focus: true });
            });
        });

        // Editing anything on a step clears that step's error, so a message
        // never outlives the value that caused it.
        signupStepEls.forEach((stepEl) => {
            const step = stepEl.dataset.signupStep;
            stepEl.addEventListener('input', () => setSignupStepError(step, ''));
            stepEl.addEventListener('change', () => setSignupStepError(step, ''));
        });

        setSignupStep(1);
    }

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

            // Sign Up's stepped flow owns its own validation, and has to run
            // before checkValidity() below rather than inside the mode ===
            // 'signup' branch further down. Two reasons:
            //   • Sign Up's only submit button is the one on its last step, so
            //     the browser routes Enter-from-any-field there and this
            //     handler is where an earlier step's Enter arrives. On step 1
            //     the later steps' required fields are still empty, and
            //     reportValidity() cannot show a bubble on a control that is
            //     not being rendered — it just logs "not focusable" and leaves
            //     the visitor with nothing.
            //   • On the last step, letting reportValidity() go first would
            //     answer an empty name or an unticked Terms box with a native
            //     bubble instead of the step's own inline message.
            if (form.dataset.authPanel === 'signup') {
                if (signupStep < signupStepEls.length) {
                    advanceSignupStep();
                    return;
                }

                // Last step: re-run every step's rules against the live field
                // values, independently of which step is showing and of what
                // the password checklist happens to be rendering. Anything
                // that fails sends the visitor back to the step that owns it
                // with the message inline, rather than posting a signup the
                // policy would have refused.
                const invalidStep = firstInvalidSignupStep();
                if (invalidStep) {
                    setSignupStep(invalidStep.step, { focus: true });
                    setSignupStepError(invalidStep.step, invalidStep.message);
                    return;
                }
            }

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
            // Sign Up carries three .auth-submit buttons now — two Continues
            // (type="button") and Create Account — and only the last is the
            // form's real submit control. Matching on type keeps setBusy()
            // disabling the button that was actually pressed, which is what
            // stops a double submit.
            const submitBtn = form.querySelector('button[type="submit"].auth-submit')
                || form.querySelector('.auth-submit');

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
                    const { data: signInData, error } = await window.sb.auth.signInWithPassword({
                        email: data.email,
                        password: data.password
                    });
                    if (error) throw error;
                    await gateOtpThenCompleteLogin(signInData.user, ['customer'], data.email);
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
                    setOtpPurpose('signup');
                    const emailLabel = overlay.querySelector('[data-verify-email]');
                    if (emailLabel) emailLabel.textContent = data.email || 'your email';
                    setActivePanel('verify');
                    startOtpFlow();
                    return;
                }

                if (mode === 'verify') {
                    const code = otpBoxes.map((box) => box.value).join('');

                    // First-login-per-device gate on a password login —
                    // reuses this same panel/boxes/resend flow, but verifies
                    // against Supabase's generic email-OTP type (sent via
                    // signInWithOtp in gateOtpThenCompleteLogin) rather than
                    // the signup-confirmation OTP below, and finishes by
                    // completing the login instead of redirecting straight
                    // to the customer dashboard.
                    if (otpPurpose === 'login') {
                        if (code.length !== 6 || !pendingLoginOtp) {
                            if (otpError) otpError.classList.add('is-visible');
                            return;
                        }

                        if (window.InigoLoading) window.InigoLoading.show('Verifying…');
                        const { error } = await window.sb.auth.verifyOtp({
                            email: pendingLoginOtp.email,
                            token: code,
                            type: 'email'
                        });

                        if (error) {
                            if (otpError) otpError.classList.add('is-visible');
                            throw error;
                        }

                        if (otpError) otpError.classList.remove('is-visible');
                        const allowedRoles = pendingLoginOtp.allowedRoles;
                        pendingLoginOtp = null;
                        await completeLogin(allowedRoles);
                        return;
                    }

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
                    const { data: signInData, error } = await window.sb.auth.signInWithPassword({
                        email: data['admin-email'],
                        password: data['admin-password']
                    });
                    if (error) throw error;
                    await gateOtpThenCompleteLogin(signInData.user, ['staff', 'admin'], data['admin-email']);
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
                    // Same creation-time policy as Sign Up step 2, read
                    // straight off the submitted value — the checklist above
                    // the field is only a hint. Without this, the reset link
                    // would be a way to set a password signup would reject.
                    if (!checkPasswordPolicy(newPassword).valid) {
                        setAuthNotice(`Your new password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters and include an uppercase letter, a lowercase letter, a number and a special character.`, true);
                        return;
                    }
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
                    // form.reset() fires no input event, so the checklist
                    // would otherwise stay ticked over an emptied field.
                    syncPasswordRules();
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
            if (!window.sb) return;

            if (otpPurpose === 'login') {
                if (!pendingLoginOtp) return;
                otpResendBtn.disabled = true;
                const { error } = await window.sb.auth.signInWithOtp({
                    email: pendingLoginOtp.email,
                    options: { shouldCreateUser: false }
                });
                if (error) {
                    setAuthNotice(friendlyAuthError(error), true);
                    otpResendBtn.disabled = false;
                    return;
                }
                startResendCountdown(30);
                return;
            }

            if (!pendingSignupEmail) return;
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
    //
    // `authNoticeDismissTimer` and `authNoticeHideTimer` used to be declared
    // here. They are now in the top-level declaration block at the head of
    // this function, because consumePendingAuthNotice() calls setAuthNotice()
    // during setup — i.e. long before this line runs. Do not move them back;
    // see assertEarlySetupBindings() for what breaks and how it is caught.

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
        // Google's official four-colour "G", 24×24 brand geometry, unmodified.
        // The previous paths here were hand-drawn approximations — the yellow
        // arc in particular swept the wrong way and overshot the mark. Google's
        // branding rules forbid recolouring, distorting, cropping or otherwise
        // restyling the mark, so these four `d`/`fill` pairs and the
        // `viewBox="0 0 24 24"` they are drawn against must stay verbatim.
        button.innerHTML = `
            <span class="auth-google-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"></path>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"></path>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"></path>
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