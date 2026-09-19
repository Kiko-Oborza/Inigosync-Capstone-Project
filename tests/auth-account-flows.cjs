// No real users, credentials, emails or SMS: provider responses are deterministic fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
function mockClient(options) {
    const user = { id: 'fixture-user', identities: [{ provider: 'email' }] };
    let session = options.oauth ? { user } : null;
    let phone = '';
    const record = (kind, data) => {
        const calls = JSON.parse(sessionStorage.getItem('fixture-calls') || '[]');
        calls.push({ kind, data }); sessionStorage.setItem('fixture-calls', JSON.stringify(calls));
    };
    if (options.oauth) sessionStorage.setItem('inigosync-oauth-pending', '1');
    window.InigoAuthStorage = { setRememberSession() {} };
    window.sb = {
        rpc: (name, data) => ({ abortSignal: async () => {
            record('emailCheck', data);
            if (data.email_address === 'slow@example.test') await new Promise(resolve => setTimeout(resolve, 900));
            if (options.emailMode === 'error') return { error: { message: 'Network error' } };
            return { data: options.emailMode === 'rate_limited' ? 'rate_limited' : ['taken@example.test', 'slow@example.test'].includes(data.email_address) ? 'taken' : 'available' };
        } }),
        auth: {
            getSession: async () => ({ data: { session } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => { record('signOut'); session = null; return {}; },
            signInWithPassword: async () => { session = { user }; return { data: { user, session } }; },
            signInWithOtp: async data => { record('emailOtp', data); return {}; },
            signUp: async data => {
                record('signUp', data);
                if (options.registrationRace === 'error') return { data: {}, error: { code: 'user_already_exists', message: 'Already registered' } };
                if (options.registrationRace === 'identities') return { data: { user: { ...user, identities: [] }, session: null } };
                session = options.emailConfirmation ? null : { user }; return { data: { user, session } };
            },
            updateUser: async data => {
                record('sendSms', data); phone = data.phone;
                if (options.providerOff) return { error: { message: 'Phone provider is disabled' } };
                return { data: { user: { ...user, new_phone: options.noPending ? null : phone.replace('+', '') } } };
            },
            verifyOtp: async data => {
                record('verifyOtp', data);
                if (data.type === 'signup') { session = { user }; return {}; }
                return data.token === '123456' ? {} : { error: { message: 'Token expired' } };
            },
            getUser: async () => ({ data: { user: { ...user, phone: options.mismatch ? '639999999999' : phone, phone_confirmed_at: new Date().toISOString() } } }),
            signInWithOAuth: async data => { record('oauth', data); return { error: { message: 'Fixture stopped redirect' } }; }
        },
        from: table => {
            let write = false;
            const query = {
                select() { return query; }, eq() { return query; },
                update(data) { record('profileWrite', data); write = true; return query; },
                upsert: async data => { record('sessionWrite', data); return {}; },
                single: async () => write ? { data: { id: user.id } } : { data: { role: options.role || 'customer', status: options.disabled ? 'disabled' : 'active' } }
            };
            return query;
        }
    };
}
(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        async function setup(options = {}) {
            const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
            page.setDefaultTimeout(10000);
            await page.route(/^https:\/\//, r => r.abort());
            await page.route('**/Config/supabaseClient.js', r => r.fulfill({ contentType: 'application/javascript', body: `(${mockClient})(${JSON.stringify(options)})` }));
            if (!options.simulation) await page.route('**/Config/phoneVerification.js', r => r.fulfill({ contentType: 'application/javascript', body: "window.InigoPhoneVerification = {mode:'live'};" }));
            await page.route('**/includes/landingPage.js', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
            await page.route('https://elfsightcdn.com/**', r => r.abort());
            await page.route('**/*dashboard.html', r => r.fulfill({ contentType: 'text/html', body: '<h1>Dashboard fixture</h1>' }));
            await page.goto('http://127.0.0.1:4178/Pages/Index.html', { waitUntil: 'domcontentloaded' });
            return page;
        }
        const calls = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('fixture-calls') || '[]'));
        async function firstStep(page, email) {
            await page.locator('.cta-buttons [data-auth-open]').click();
            await page.locator('[role="tab"][data-auth-tab="signup"]').click();
            const form = page.locator('[data-auth-panel="signup"]');
            await form.locator('[name="email"]').fill(email);
            await form.locator('[name="password"]').fill('Fixture2026!');
            return form;
        }
        for (const width of [320, 390, 768, 1440]) {
            for (const theme of ['light', 'dark']) {
                const page = await setup();
                await page.setViewportSize({ width, height: 900 });
                await page.addStyleTag({ content: '.auth-modal, .auth-modal * { animation: none !important; transition: none !important; }' });
                await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
                const form = await firstStep(page, '');
                const height = await form.evaluate(el => el.getBoundingClientRect().height);
                const borders = [];
                for (const [email, label] of [['taken@example.test', 'Not available'], ['new@example.test', 'Available']]) {
                    await form.locator('[name="email"]').fill(email);
                    await page.waitForFunction(label => document.querySelector('[data-signup-email-status]').textContent === label, label);
                    assert.equal(await form.evaluate(el => el.getBoundingClientRect().height), height, `${width}px ${theme}: email status must not resize form`);
                    borders.push(await form.locator('[name="email"]').evaluate(el => getComputedStyle(el).borderColor));
                    assert(await form.evaluate(el => el.scrollWidth <= el.clientWidth));
                }
                assert.notEqual(borders[0], borders[1]);
                await page.close();
            }
        }
        const taken = await setup();
        const takenForm = await firstStep(taken, 'Taken@Example.test');
        await taken.waitForFunction(() => document.querySelector('[data-signup-email-status]').textContent.includes('Not available'));
        await taken.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'inigosync-email-taken.png') });
        await takenForm.locator('[data-signup-next]').click();
        assert(await takenForm.locator('[data-signup-step="1"]').evaluate(el => el.classList.contains('is-active')));
        assert(!(await calls(taken)).some(c => c.kind === 'signUp'));
        await takenForm.locator('[name="email"]').fill('new@example.test');
        await takenForm.locator('[data-signup-next]').click();
        await takenForm.locator('[data-signup-step="2"].is-active').waitFor();
        await taken.close();
        for (const emailMode of ['error', 'rate_limited']) {
            const page = await setup({ emailMode });
            const form = await firstStep(page, 'new@example.test');
            await form.locator('[data-signup-next]').click();
            await page.waitForFunction(() => /Try again|Wait 1 min/.test(document.querySelector('[data-signup-email-status]').textContent));
            assert(await form.locator('[data-signup-step="1"]').evaluate(el => el.classList.contains('is-active')));
            await page.close();
        }
        const stale = await setup();
        const staleForm = await firstStep(stale, 'slow@example.test');
        await stale.waitForFunction(() => JSON.parse(sessionStorage.getItem('fixture-calls') || '[]').some(c => c.kind === 'emailCheck'));
        await staleForm.locator('[name="email"]').fill('new@example.test');
        await staleForm.locator('[data-signup-next]').click();
        await staleForm.locator('[data-signup-step="2"].is-active').waitFor();
        await stale.waitForTimeout(1000);
        assert(!/Not available/.test(await stale.locator('[data-signup-email-status]').innerText()));
        await stale.close();
        async function signup(page, phone = '') {
            await page.locator('.cta-buttons [data-auth-open]').click();
            await page.locator('[role="tab"][data-auth-tab="signup"]').click();
            const form = page.locator('[data-auth-panel="signup"]');
            await form.locator('[name="email"]').fill('customer@example.test');
            await form.locator('[name="password"]').fill('Fixture2026!');
            await form.locator('[data-signup-next]').click();
            await form.locator('[name="surname"]').fill('Tester');
            await form.locator('[name="firstname"]').fill('Customer');
            await form.locator('[name="mobile"]').fill(phone);
            await form.locator('[name="terms"]').check();
            await form.locator('button[type="submit"]').click();
        }
        for (const role of ['admin', 'staff']) {
            const page = await setup({ oauth: true, role });
            await page.locator('[data-auth-access-error]').waitFor({ state: 'visible' });
            assert.match(await page.locator('[data-auth-access-error]').innerText(), /cannot be used for customer/);
            assert((await calls(page)).some(c => c.kind === 'signOut'));
            assert(!(await calls(page)).some(c => ['profileWrite', 'sessionWrite'].includes(c.kind)));
            assert(await page.evaluate(async () => !(await sb.auth.getSession()).data.session));
            await page.close();
        }
        const disabled = await setup({ oauth: true, disabled: true });
        await disabled.locator('[data-auth-access-error]').waitFor({ state: 'visible' });
        assert.match(await disabled.locator('[data-auth-access-error]').innerText(), /disabled/);
        await disabled.close();
        const customer = await setup({ oauth: true });
        await customer.waitForURL('**/user_dashboard.html'); await customer.close();
        for (const role of ['staff', 'admin', 'customer']) {
            const page = await setup({ role });
            await page.locator('.cta-buttons [data-auth-open]').click();
            const panel = role === 'customer' ? 'admin' : 'login';
            if (panel === 'admin') await page.locator('[data-auth-tab="admin"]').click();
            const form = page.locator(`[data-auth-panel="${panel}"]`);
            await form.locator('input[type="email"]').fill('account@example.test');
            await form.locator('input[type="password"]').fill('Fixture2026!');
            await form.locator('button[type="submit"]').click();
            await page.locator('[data-auth-access-error]').waitFor({ state: 'visible' });
            assert(!(await calls(page)).some(c => ['emailOtp', 'sessionWrite'].includes(c.kind)));
            assert((await calls(page)).some(c => c.kind === 'signOut'));
            await page.close();
        }
        const blank = await setup(); await signup(blank);
        await blank.waitForURL('**/user_dashboard.html');
        assert.equal((await calls(blank)).find(c => c.kind === 'signUp').data.options.data.contact_num, null);
        assert(!(await calls(blank)).some(c => c.kind === 'sendSms')); await blank.close();
        const invalid = await setup(); await signup(invalid, '0912');
        assert(!(await calls(invalid)).some(c => c.kind === 'signUp')); await invalid.close();
        for (const registrationRace of ['error', 'identities']) {
            const page = await setup({ registrationRace }); await signup(page);
            await page.locator('[data-signup-step="1"].is-active').waitFor();
            assert.match(await page.locator('[data-signup-error-for="email"]').innerText(), /already registered/);
            assert(page.url().includes('Index.html')); await page.close();
        }
        for (const emailConfirmation of [false, true]) {
            const page = await setup({ emailConfirmation });
            await page.setViewportSize({ width: emailConfirmation ? 320 : 390, height: 844 });
            await signup(page, '09171234567');
            if (emailConfirmation) {
                await page.locator('[data-auth-panel="verify"].is-active').waitFor();
                for (let i = 0; i < 6; i++) await page.locator('[data-otp-box]').nth(i).fill(String(i + 1));
                await page.locator('[data-auth-panel="verify"] button[type="submit"]').click();
            }
            await page.locator('[data-auth-panel="phone"].is-active').waitFor();
            const numberBox = await page.locator('[data-signup-phone-number]').boundingBox();
            const verifyBox = await page.locator('[data-signup-phone-send]').boundingBox();
            assert.equal(numberBox.y, verifyBox.y);
            assert(verifyBox.x >= numberBox.x + numberBox.width);
            assert(verifyBox.x + verifyBox.width <= page.viewportSize().width);
            assert(!(await calls(page)).some(c => c.kind === 'sendSms'));
            await page.locator('[data-signup-phone-send]').click();
            await page.locator('[data-signup-phone-code]').fill('000000');
            await page.locator('[data-signup-phone-confirm]').click();
            await page.waitForFunction(() => document.querySelector('[data-signup-phone-status]').textContent.includes('incorrect'));
            assert(!(await calls(page)).some(c => c.kind === 'profileWrite'));
            assert(await page.locator('[data-signup-phone-send]').isDisabled());
            await page.locator('[data-signup-phone-code]').fill('123456');
            await page.locator('[data-signup-phone-confirm]').click();
            await page.waitForFunction(() => document.querySelector('[data-signup-phone-send]').textContent === 'Verified');
            assert(await page.locator('[data-signup-phone-send]').isDisabled());
            await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'inigosync-phone-verified.png') });
            await page.locator('[data-signup-phone-skip]').click();
            await page.waitForURL('**/user_dashboard.html');
            assert.deepEqual((await calls(page)).find(c => c.kind === 'profileWrite').data, { contact_num: '09171234567', phone_verified: true });
            await page.close();
        }
        for (const options of [{ providerOff: true }, { noPending: true }, { mismatch: true }]) {
            const page = await setup(options); await signup(page, '09171234567');
            await page.locator('[data-signup-phone-send]').click();
            if (options.mismatch) {
                await page.locator('[data-signup-phone-code]').fill('123456');
                await page.locator('[data-signup-phone-confirm]').click();
                await page.waitForFunction(() => document.querySelector('[data-signup-phone-status]').textContent.includes('could not confirm'));
            } else {
                await page.waitForFunction(() => document.querySelector('[data-signup-phone-status]').textContent.includes('unavailable'));
                assert(await page.locator('[data-signup-phone-code]').isHidden());
            }
            assert(!(await calls(page)).some(c => c.kind === 'profileWrite'));
            await page.locator('[data-signup-phone-skip]').click();
            await page.waitForURL('**/user_dashboard.html'); await page.close();
        }
        const demo = await setup({ simulation: true }); await signup(demo, '09171234567');
        await demo.locator('[data-signup-phone-send]').click();
        assert.match(await demo.locator('[data-signup-phone-description]').innerText(), /Capstone SMS demo/);
        assert.match(await demo.locator('[data-signup-phone-status]').innerText(), /123456/);
        await demo.locator('[data-signup-phone-code]').fill('000000');
        await demo.locator('[data-signup-phone-confirm]').click();
        assert.match(await demo.locator('[data-signup-phone-status]').innerText(), /incorrect/);
        await demo.evaluate(() => { const now = Date.now(); Date.now = () => now + 61000; });
        await demo.locator('[data-signup-phone-code]').fill('123456');
        await demo.locator('[data-signup-phone-confirm]').click();
        assert.match(await demo.locator('[data-signup-phone-status]').innerText(), /expired/);
        await demo.locator('[data-signup-phone-send]').click();
        await demo.locator('[data-signup-phone-code]').fill('123456');
        await demo.locator('[data-signup-phone-confirm]').click();
        assert.equal(await demo.locator('[data-signup-phone-send]').innerText(), 'Demo passed');
        assert(!(await calls(demo)).some(c => ['sendSms', 'profileWrite', 'verifyOtp'].includes(c.kind)));
        await demo.locator('[data-signup-phone-skip]').click();
        await demo.waitForURL('**/user_dashboard.html'); await demo.close();
        console.log('PASS free simulation: invalid/expired code, resend, demo success, zero SMS/OTP/profile writes');
        const cancelled = await setup(); await signup(cancelled, '09171234567');
        await cancelled.locator('[data-auth-panel="phone"].is-active').waitFor();
        await cancelled.locator('[data-auth-close]').click();
        await cancelled.waitForFunction(() => document.querySelector('[data-auth-overlay]').hidden);
        assert(cancelled.url().includes('Index.html'));
        assert(!(await calls(cancelled)).some(c => ['profileWrite', 'sessionWrite', 'sendSms'].includes(c.kind)));
        await cancelled.close();
        console.log('PASS early email checks: taken/available, edit recovery, stale responses, network failure, rate limit and final-signup races');
        console.log('PASS OAuth role/disabled rejections, customer OAuth, optional/invalid phone, email-confirmed and immediate signup, real API contract, invalid OTP, cooldown, verified-only save, disabled provider, missing challenge, mismatched number and skip');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
