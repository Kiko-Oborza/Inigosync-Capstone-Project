// Optional, post-email-confirmation SMS challenge for the newly signed-in customer.
// Live mode uses Supabase phone_change; capstone simulation never calls the provider.
(() => {
    let cancel = () => {};
    window.InigoSignupPhone = {
        cancel: () => cancel(),
        verify({ phone, userId }) {
            const simulation = window.InigoPhoneVerification?.mode !== 'live';
            return new Promise(resolve => {
                const form = document.querySelector('[data-auth-panel="phone"]');
                const send = form.querySelector('[data-signup-phone-send]');
                const confirm = form.querySelector('[data-signup-phone-confirm]');
                const skip = form.querySelector('[data-signup-phone-skip]');
                const field = form.querySelector('[data-signup-phone-code-field]');
                const code = form.querySelector('[data-signup-phone-code]');
                const status = form.querySelector('[data-signup-phone-status]');
                form.querySelector('[data-signup-phone-description]').textContent = simulation
                    ? 'Capstone SMS demo — no text is sent and your real number stays unverified. Use the test code shown below.'
                    : 'Your account is ready. Verify your number by text, or skip for now.';
                const e164 = `+63${phone.slice(1)}`;
                const digits = value => String(value || '').replace(/\D/g, '');
                let active = true, busy = false, sent = false, verified = false, timer, resendAt = 0;
                let demoExpiresAt = 0;
                form.reset(); field.hidden = confirm.hidden = true;
                form.querySelector('[data-signup-phone-number]').value = phone;
                status.textContent = '';
                send.disabled = confirm.disabled = skip.disabled = false;
                send.textContent = 'Verify';
                send.classList.remove('is-verified');
                skip.textContent = 'Skip for now';
                const handlers = new AbortController();
                function finish(result) {
                    if (!active) return;
                    active = false;
                    clearInterval(timer);
                    handlers.abort();
                    cancel = () => {};
                    resolve(result);
                }
                cancel = () => finish('cancelled');
                function cooldown() {
                    const seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
                    send.disabled = verified || busy || seconds > 0;
                    send.textContent = verified ? (simulation ? 'Demo passed' : 'Verified') : seconds ? `Resend ${seconds}s` : sent ? 'Resend' : 'Verify';
                }
                function showSuccess() {
                    verified = true;
                    clearInterval(timer);
                    send.classList.add('is-verified');
                    field.hidden = confirm.hidden = true;
                    status.textContent = simulation ? 'Demo complete. No SMS was sent; your real number remains unverified.' : 'Number verified.';
                    skip.textContent = 'Continue';
                    setBusy(false);
                    skip.focus();
                }
                function setBusy(value) {
                    busy = value;
                    confirm.disabled = skip.disabled = value;
                    cooldown();
                }
                function message(error) {
                    const raw = String(error?.message || '').toLowerCase();
                    if (/rate|too many|seconds/.test(raw)) return 'Please wait a minute before requesting another code.';
                    if (/already|registered|exists/.test(raw)) return 'This mobile number is linked to another account. You can add a different number later in Account Settings.';
                    return 'SMS verification is currently unavailable. Your account is ready—you can skip this step and verify your number later in Account Settings.';
                }
                send.addEventListener('click', async () => {
                    if (!active || busy || verified || Date.now() < resendAt) return;
                    setBusy(true);
                    status.textContent = 'Sending your verification text…';
                    try {
                        if (simulation) {
                            sent = true; field.hidden = confirm.hidden = false;
                            code.value = '';
                            status.textContent = 'Simulated SMS: your test code is 123456. It expires in 60 seconds. No text was sent.';
                            demoExpiresAt = resendAt = Date.now() + 60000;
                            clearInterval(timer); timer = setInterval(cooldown, 1000);
                            code.focus();
                            return;
                        }
                        const { data, error } = await window.sb.auth.updateUser({ phone: e164 });
                        if (!active) return;
                        if (error) throw error;
                        if (digits(data?.user?.new_phone) !== digits(e164)) throw new Error('Phone confirmations unavailable');
                        sent = true; field.hidden = confirm.hidden = false;
                        status.textContent = `We sent a 6-digit code to ${phone}. Enter it below.`;
                        code.focus();
                        resendAt = Date.now() + 60000;
                        clearInterval(timer); timer = setInterval(cooldown, 1000);
                    } catch (error) {
                        if (active) status.textContent = message(error);
                    } finally { if (active) setBusy(false); }
                }, { signal: handlers.signal });
                form.addEventListener('submit', async event => {
                    event.preventDefault();
                    if (!active || busy || verified || !sent) return;
                    if (!/^\d{6}$/.test(code.value.trim())) {
                        status.textContent = 'Enter the 6-digit code from your text message.'; code.focus(); return;
                    }
                    setBusy(true);
                    try {
                        if (simulation) {
                            if (code.value.trim() !== '123456' || Date.now() >= demoExpiresAt) {
                                status.textContent = 'That demo code is incorrect or has expired. Use 123456 before expiry, or resend.';
                                return;
                            }
                            showSuccess();
                            return;
                        }
                        const { error } = await window.sb.auth.verifyOtp({ phone: e164, token: code.value.trim(), type: 'phone_change' });
                        if (!active) return;
                        if (error) { status.textContent = 'That code is incorrect or has expired. Try again or request a new code.'; return; }
                        const { data, error: userError } = await window.sb.auth.getUser();
                        if (!active) return;
                        if (userError || data?.user?.id !== userId || !data.user.phone_confirmed_at || digits(data.user.phone) !== digits(e164)) {
                            status.textContent = 'We could not confirm this number. Please try again in Account Settings.'; return;
                        }
                        const { data: saved, error: saveError } = await window.sb.from('profiles')
                            .update({ contact_num: phone, phone_verified: true }).eq('id', userId).select('id').single();
                        if (!active) return;
                        if (saveError || !saved) { status.textContent = 'Your code was accepted, but we could not save the verification. Please try again in Account Settings.'; return; }
                        showSuccess();
                    } catch (error) {
                        if (active) status.textContent = 'We could not verify your number right now. Please try again or skip for now.';
                    } finally { if (active) setBusy(false); }
                }, { signal: handlers.signal });
                skip.addEventListener('click', () => { if (!busy) finish(verified ? (simulation ? 'simulated' : 'verified') : 'skipped'); }, { signal: handlers.signal });
                send.focus();
            });
        }
    };
})();
