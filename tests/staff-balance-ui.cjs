// Staff balance collection UI: browser fixture only, no live payment or writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const booking = {
    booking_id: 42, customer_id: 'qa-customer', sports: 'Basketball', courts: 'Basketball',
    court_unit: 'Court 1', court_unit_inventory_id: 'qa-unit',
    time_date: '2026-09-27T09:00:00+08:00', end_at: '2026-09-27T10:00:00+08:00',
    duration_minutes: 60, status: 'confirmed', checked_in_at: null,
    amount_total: 100, amount_paid: 50, payment_option: 'downpayment',
    payment_id: 12, rate_unit_snapshot: '/hr', rate_quantity: 1,
};

function fixture(row) {
    window.__balanceQa = { calls: [], booking: row };
    const qa = window.__balanceQa;
    function result(table, query) {
        if (query.write) {
            qa.calls.push({ kind: query.write, table, payload: query.payload });
            return { data: [], error: null };
        }
        if (table === 'booking') return { data: query.one ? qa.booking : [qa.booking], error: null };
        if (table === 'profiles') {
            const profiles = [{ id: 'qa-staff', role: 'staff', status: 'active', full_name: 'QA Staff' },
                { id: 'qa-customer', role: 'customer', status: 'active', full_name: 'QA Customer' }];
            return { data: query.one ? profiles[0] : profiles, error: null };
        }
        if (table === 'app_settings') return { data: query.one ? { cash_enabled: true, card_enabled: true, gcash_enabled: true, downpayment_pct: 50, night_rate_starts_at: '18:00:00' } : [], error: null };
        return { data: query.one ? null : [], error: null };
    }
    const from = table => {
        const query = { write: null, payload: null, one: false };
        const chain = {
            select() { return chain; }, eq() { return chain; }, in() { return chain; },
            gte() { return chain; }, gt() { return chain; }, lt() { return chain; }, lte() { return chain; },
            is() { return chain; }, or() { return chain; }, order() { return chain; },
            limit() { return chain; }, range() { return chain; },
            single() { query.one = true; return Promise.resolve(result(table, query)); },
            maybeSingle() { query.one = true; return Promise.resolve(result(table, query)); },
            update(payload) { query.write = 'update'; query.payload = payload; return chain; },
            insert(payload) { query.write = 'insert'; query.payload = payload; return chain; },
            then(resolve, reject) { return Promise.resolve(result(table, query)).then(resolve, reject); },
        };
        return chain;
    };
    window.sb = {
        from,
        rpc: async (name, args) => {
            qa.calls.push({ kind: 'rpc', name, args });
            if (window.__qaRecordBalance) await window.__qaRecordBalance({ kind: 'rpc', name, args });
            if (name === 'staff_collect_cash_and_check_in') {
                qa.booking = { ...qa.booking, amount_paid: 100, checked_in_at: new Date().toISOString() };
                return { data: { ok: true }, error: null };
            }
            return { data: [], error: null };
        },
        functions: { invoke: async (name, options) => {
            qa.calls.push({ kind: 'function', name, options });
            if (window.__qaRecordBalance) await window.__qaRecordBalance({ kind: 'function', name, options });
            return { data: { checkout_url: 'https://checkout.paymongo.com/qa-balance' }, error: null };
        } },
        auth: {
            getSession: async () => ({ data: { session: { user: { id: 'qa-staff' } } } }),
            getUser: async () => ({ data: { user: { id: 'qa-staff' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => ({}),
        },
    };
}

async function openBalancePage(browser, row, { query = '', onRecord } = {}) {
    const context = await browser.newContext({ timezoneId: 'Asia/Manila', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    if (onRecord) await page.exposeFunction('__qaRecordBalance', onRecord);
    await page.clock.install({ time: new Date('2026-09-27T09:00:00+08:00') });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/^https:\/\//, route => route.abort());
    await page.route('**/includes/loadingOverlay.js', route => route.fulfill({ contentType: 'application/javascript',
        body: `window.__qaToasts=[];window.InigoLoading={show(){},hide(){}};window.InigoToast={show:(message,isError)=>window.__qaToasts.push({message,isError})};` }));
    await page.route('**/Config/supabaseClient.js', route => route.fulfill({ contentType: 'application/javascript',
        body: `(${fixture})(${JSON.stringify(row)});` }));
    await page.route('**/includes/authGuard.js', route => route.fulfill({ contentType: 'application/javascript',
        body: `window.inigosyncProfile={id:'qa-staff',role:'staff',status:'active',full_name:'QA Staff'};document.addEventListener('DOMContentLoaded',()=>{window.InigoLoading?.hide();document.documentElement.classList.remove('inigo-auth-pending');document.dispatchEvent(new CustomEvent('inigosync:profile-ready',{detail:window.inigosyncProfile}));});` }));
    await page.route('**/includes/appSettings.js', route => route.fulfill({ contentType: 'application/javascript',
        body: `window.InigoAppSettings={DEFAULT_SETTINGS:{downpaymentPct:50,cashEnabled:true,cardEnabled:true,gcashEnabled:true},getSettings:async()=>({downpaymentPct:50,cashEnabled:true,cardEnabled:true,gcashEnabled:true,nightRateStartsAt:'18:00'})};` }));
    await page.route('**/includes/courtsData.js', route => route.fulfill({ contentType: 'application/javascript',
        body: `window.InigoCourtsData={getCourts:async()=>[],getSports:async()=>[],resolveCourtUnits:()=>({units:[]}),invalidateCourts(){},monogramFor:()=>'',slugify:s=>s};` }));
    await page.goto(`http://127.0.0.1:4178/Pages/staff_dashboard.html${query}`, { waitUntil: 'domcontentloaded' });
    return { context, page, errors };
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const method of ['Cash', 'PayMongo']) {
            const calls = [];
            const { context, page, errors } = await openBalancePage(browser, booking, { onRecord: call => calls.push(call) });
            const timeIn = page.locator('[data-staff-table="overview"] [data-staff-action="timein"]').first();
            await timeIn.waitFor();
            await timeIn.click();
            await page.locator('[data-staff-timein-balance]').getByText('₱50.00').waitFor();
            await page.locator(`[data-staff-timein-method="${method}"]`).check();
            await page.locator('[data-staff-timein-confirm]').click();
            if (method === 'Cash') {
                await page.waitForFunction(() => window.__balanceQa.calls.some(call => call.name === 'staff_collect_cash_and_check_in'));
                const cash = await page.evaluate(() => window.__balanceQa.calls.find(call => call.name === 'staff_collect_cash_and_check_in'));
                assert.deepEqual(cash.args, { p_source: 'booking', p_id: '42' });
                assert.equal(await page.evaluate(() => window.__balanceQa.calls.some(call => call.kind === 'function')), false);
            } else {
                await page.waitForTimeout(200);
                const online = calls.find(call => call.name === 'paymongo-balance-checkout');
                assert.equal(online?.options.body.source, 'booking');
                assert.equal(online?.options.body.id, '42');
                assert.equal(calls.some(call => call.name === 'staff_collect_cash_and_check_in'), false);
            }
            if (method === 'Cash') assert.equal(await page.evaluate(() => window.__balanceQa.calls.some(call => call.table === 'payment' && call.kind === 'insert')), false);
            assert.deepEqual(errors, [], `${method} browser errors`);
            await context.close();
        }

        for (const scenario of [
            { row: { ...booking, amount_paid: 100, checked_in_at: '2026-09-27T01:01:00Z', balance_payment_method: 'PayMongo' },
                expected: 'The balance is paid and Time-In was recorded.' },
            { row: { ...booking, amount_paid: 100, status: 'unattended', balance_payment_method: 'PayMongo' },
                expected: 'The balance was paid, but Time-In was not recorded.' },
        ]) {
            const returned = await openBalancePage(browser, scenario.row,
                { query: '?balance_checkout=return&source=booking&id=42' });
            await returned.page.waitForFunction(expected => window.__qaToasts.some(toast => toast.message.includes(expected)), scenario.expected);
            assert.equal(await returned.page.locator('[data-staff-timein-modal]').isHidden(), true,
                'returning from balance checkout must not reopen Time-In');
            assert.equal(await returned.page.evaluate(() => window.__balanceQa.calls.some(call => call.name === 'staff_collect_cash_and_check_in')), false,
                'return handling does not attempt a second Time-In');
            assert.deepEqual(returned.errors, [], 'balance return browser errors');
            await returned.context.close();
        }

        const stale = await openBalancePage(browser, booking);
        await stale.page.locator('[data-staff-table="overview"] [data-staff-action="timein"]').first().click();
        await stale.page.locator('[data-staff-timein-balance]').getByText('₱50.00').waitFor();
        await stale.page.locator('[data-staff-timein-method="Cash"]').check();
        await stale.page.evaluate(() => {
            window.__balanceQa.booking = { ...window.__balanceQa.booking, amount_paid: 100,
                checked_in_at: '2026-09-27T01:01:00Z' };
        });
        await stale.page.locator('[data-staff-timein-confirm]').click();
        await stale.page.waitForFunction(() => window.__qaToasts.some(toast => toast.message.includes('Time-In was already recorded')));
        assert.equal(await stale.page.locator('[data-staff-timein-confirm]').isDisabled(), true,
            'a stale modal cannot submit a second Time-In');
        assert.equal(await stale.page.evaluate(() => window.__balanceQa.calls.some(call => call.name === 'staff_collect_cash_and_check_in')), false);
        assert.deepEqual(stale.errors, [], 'stale modal browser errors');
        await stale.context.close();
        console.log('PASS staff balance UI: Cash and PayMongo, verified return states, and stale Time-In prevention');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
