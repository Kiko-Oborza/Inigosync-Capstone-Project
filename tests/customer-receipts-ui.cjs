// Focused customer receipt regression. Supabase calls are fixtures; no live
// payment or database writes are performed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = 'http://127.0.0.1:4178/Pages/';
const booking = {
    booking_id: 812, customer_id: 'qa-customer', sports: 'Basketball', courts: 'Basketball',
    court_unit: 'Court 1', time_date: '2026-09-29T09:00:00+08:00', end_at: '2026-09-29T10:00:00+08:00',
    duration_minutes: 60, status: 'confirmed', amount_total: 100, amount_paid: 100,
    payment_option: 'downpayment', payment_id: 1101, balance_payment_id: 1102,
};

const acknowledgment = (receiptId, receiptNumber, amountMinor, remainingMinor, method) => ({
    receipt_id: receiptId,
    receipt_number: receiptNumber,
    issued_at: '2026-09-29T01:00:00Z',
    customer_name: 'QA Customer',
    mobile: '09123456789',
    items: [{ sport: 'Basketball', court: 'Basketball', unit: 'Court 1',
        starts_at: booking.time_date, ends_at: booking.end_at, subtotal_minor: 10000, subtotal: 100 }],
    subtotal_minor: amountMinor,
    amount_paid_minor: amountMinor,
    amount_paid: amountMinor / 100,
    remaining_balance_minor: remainingMinor,
    remaining_balance: remainingMinor / 100,
    fee_minor: 0,
    fee: 0,
    gross_minor: amountMinor,
    total: amountMinor / 100,
    payment_method: method,
    payment_status: 'paid',
});

const paymentHistory = [
    { payment_id: 1101, created_at: '2026-09-28T01:00:00Z', method: 'Cash',
        acknowledgment: acknowledgment('qa-deposit', 'PA-20260928-0000001', 5000, 5000, 'Cash') },
    { payment_id: 1102, created_at: '2026-09-29T01:00:00Z', method: 'Cash',
        acknowledgment: acknowledgment('qa-balance', 'PA-20260929-0000002', 5000, 0, 'Cash') },
];
const walkinAck = acknowledgment('qa-walkin', 'PA-20260929-0000003', 2500, 0, 'Cash');

function installFixture(options) {
    const { booking, paymentHistory, walkinAck } = options;
    window.__receiptQa = { calls: [] };
    const profile = { id: 'qa-customer', role: 'customer', status: 'active', full_name: 'QA Customer' };
    const from = table => {
        const query = { one: false };
        const result = () => {
            if (table === 'booking') return { data: [booking], error: null };
            if (table === 'profiles') return { data: query.one ? profile : [profile], error: null };
            if (table === 'app_settings' && query.one) return { data: { downpayment_pct: 50 }, error: null };
            return { data: query.one ? null : [], error: null };
        };
        const chain = {
            select() { return chain; }, eq() { return chain; }, in() { return chain; },
            gte() { return chain; }, gt() { return chain; }, lt() { return chain; }, lte() { return chain; },
            is() { return chain; }, or() { return chain; }, order() { return chain; }, limit() { return chain; },
            range() { return chain; }, single() { query.one = true; return Promise.resolve(result()); },
            maybeSingle() { query.one = true; return Promise.resolve(result()); },
            then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        };
        return chain;
    };
    window.sb = {
        from,
        rpc: async (name, args) => {
            window.__receiptQa.calls.push({ name, args });
            if (name === 'customer_get_booking_payment_acknowledgments') {
                return { data: { source: 'booking', id: booking.booking_id, payment_history: paymentHistory }, error: null };
            }
            if (name === 'customer_list_walkin_acknowledgments') {
                return { data: { total_count: 1, rows: [{ order_id: 'qa-order', receipt_id: walkinAck.receipt_id,
                    receipt_number: walkinAck.receipt_number, issued_at: walkinAck.issued_at, payload: walkinAck }] }, error: null };
            }
            return { data: [], error: null };
        },
        functions: { invoke: async () => ({ data: null, error: null }) },
        auth: {
            getSession: async () => ({ data: { session: { user: { id: profile.id } } } }),
            getUser: async () => ({ data: { user: { id: profile.id } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => ({}),
        },
    };
}

(async () => {
    const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260930063008_customer_booking_payment_acknowledgments.sql'), 'utf8');
    assert.match(migration, /p\.role\s*=\s*'customer'\s+and\s+p\.status\s*=\s*'active'/i,
        'the RPC requires an active customer role');
    assert.match(migration, /v_customer\s+is distinct from\s+v_actor/i,
        'the RPC compares the booking owner with auth.uid()');
    assert.match(migration, /revoke all on function public\.customer_get_booking_payment_acknowledgments\(bigint\) from public, anon, authenticated/i,
        'the RPC removes default execute grants before granting authenticated access');
    assert.match(migration, /grant execute on function public\.customer_get_booking_payment_acknowledgments\(bigint\) to authenticated/i);

    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const context = await browser.newContext({ timezoneId: 'Asia/Manila', viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        await page.clock.install({ time: new Date('2026-09-30T09:00:00+08:00') });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route(/^https:\/\//, route => route.abort());
        await page.route('**/includes/loadingOverlay.js', route => route.fulfill({ contentType: 'application/javascript',
            body: `window.InigoLoading={show(){},hide(){}};window.InigoToast={show(){}};` }));
        await page.route('**/Config/supabaseClient.js', route => route.fulfill({ contentType: 'application/javascript',
            body: `(${installFixture})(${JSON.stringify({ booking, paymentHistory, walkinAck })});` }));
        await page.route('**/includes/authGuard.js', route => route.fulfill({ contentType: 'application/javascript',
            body: `window.inigosyncProfile={id:'qa-customer',role:'customer',status:'active',full_name:'QA Customer'};document.addEventListener('DOMContentLoaded',()=>{window.InigoLoading.hide();document.documentElement.classList.remove('inigo-auth-pending');document.dispatchEvent(new CustomEvent('inigosync:profile-ready',{detail:window.inigosyncProfile}));});` }));
        await page.route('**/includes/courtsData.js', route => route.fulfill({ contentType: 'application/javascript',
            body: `window.InigoCourtsData={getCourts:async()=>[],getSports:async()=>[],resolveCourtUnits:()=>({units:[]}),invalidateCourts(){},monogramFor:()=>'',slugify:s=>s};` }));
        await page.route('**/includes/appSettings.js', route => route.fulfill({ contentType: 'application/javascript',
            body: `window.InigoAppSettings={DEFAULT_SETTINGS:{downpaymentPct:50},getSettings:async()=>({downpaymentPct:50})};` }));
        await page.goto(base + 'user_dashboard.html', { waitUntil: 'domcontentloaded' });
        const receipts = page.locator('[data-dash-booking-receipts] .dash-payment-ack-card');
        await receipts.first().waitFor({ state: 'attached' });
        await page.waitForFunction(() => document.querySelectorAll('[data-dash-booking-receipts] .dash-payment-ack-card').length === 2);
        assert.deepEqual(await receipts.locator('.dash-receipt-no').allTextContents(), [
            'Acknowledgment #PA-20260928-0000001', 'Acknowledgment #PA-20260929-0000002',
        ], 'deposit and balance acknowledgment cards are both rendered in payment order');
        assert.equal(await receipts.locator('[data-dash-receipt-download]').count(), 2,
            'each payment acknowledgment remains independently downloadable');
        assert.deepEqual(await receipts.evaluateAll(cards => cards.map(card => card.dataset.dashReceiptCard)), [
            '812-payment-1101', '812-payment-1102',
        ], 'payment receipt cards have distinct stable download targets');

        const walkinReceipts = page.locator('[data-dash-walkin-receipts] .dash-payment-ack-card');
        await walkinReceipts.first().waitFor({ state: 'attached' });
        assert.equal(await walkinReceipts.locator('.dash-receipt-no').textContent(), 'Acknowledgment #PA-20260929-0000003',
            'linked walk-in receipt history remains visible');
        const calls = await page.evaluate(() => window.__receiptQa.calls);
        assert.deepEqual(calls.filter(call => call.name === 'customer_get_booking_payment_acknowledgments')
            .map(call => call.args), [{ p_booking_id: '812' }]);
        assert.equal(calls.some(call => call.name === 'get_payment_acknowledgment'), false,
            'customer booking receipts no longer use the single-latest-payment RPC');
        assert.equal(calls.some(call => call.name === 'customer_list_walkin_acknowledgments'), true,
            'linked walk-in history still uses its existing customer RPC');
        assert.deepEqual(errors, [], 'customer receipt page has no browser errors');
        await context.close();
        console.log('PASS customer receipt history: deposit, balance, independent downloads, active customer RPC contract, and linked walk-ins');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
