// Independent reservation UI checks. Run with scripts/preview.cjs on port 4178.
// All Supabase calls are fixtures; this never creates live rows.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = 'http://127.0.0.1:4178/Pages/';
const fixedNow = '2026-09-24T09:00:00+08:00';
const day = '2026-09-24';
const tomorrow = '2026-09-25';

function occupied(source, court, unit, date, hour, status = 'pending') {
    const start = `${date}T${String(hour).padStart(2, '0')}:00:00+08:00`;
    const end = `${date}T${String(hour + 1).padStart(2, '0')}:00:00+08:00`;
    return { source, courts: court, court_unit: unit, time_date: start, end_at: end, duration_minutes: 60, status };
}

function clientFixture(options) {
    const data = options.rows.slice();
    const calls = [];
    window.__reservationQa = { data, calls, insertError: options.insertError || null, rpcError: null, rpcDelayForDay: {} };
    const result = (table, query) => {
        if (query.write === 'insert') {
            calls.push({ kind: 'insert', table, payload: query.payload });
            if (window.__reservationQa.insertError) return { data: null, error: window.__reservationQa.insertError };
            if (table === 'booking' || table === 'walk_in_booking') {
                data.push({ ...query.payload, source: table === 'booking' ? 'online' : 'walkin' });
            }
            return { data: table === 'walk_in_booking' ? [{ walkin_id: 101, ...query.payload }] : [], error: null };
        }
        if (query.write === 'update') return { data: [], error: null };
        if (table === 'profiles' && query.one) return { data: window.inigosyncProfile, error: null };
        return { data: [], error: null };
    };
    const from = table => {
        const query = { write: null, payload: null, one: false };
        const chain = {
            select() { return chain; }, eq() { return chain; }, in() { return chain; },
            gte() { return chain; }, gt() { return chain; }, lte() { return chain; },
            lt() { return chain; }, is() { return chain; }, or() { return chain; },
            order() { return chain; }, limit() { return chain; }, range() { return chain; },
            single() { query.one = true; return Promise.resolve(result(table, query)); },
            maybeSingle() { query.one = true; return Promise.resolve(result(table, query)); },
            insert(payload) { query.write = 'insert'; query.payload = payload; return chain; },
            update(payload) { query.write = 'update'; query.payload = payload; return chain; },
            then(resolve, reject) { return Promise.resolve(result(table, query)).then(resolve, reject); }
        };
        return chain;
    };
    window.sb = {
        from,
        rpc: async (name, args) => {
            calls.push({ kind: 'rpc', name, args });
            if (name !== 'court_occupancy') return { data: [], error: null };
            const start = Date.parse(args.from_at), end = Date.parse(args.to_at);
            const snapshot = data.filter(row => ['pending', 'confirmed'].includes(row.status)
                && Date.parse(row.time_date) < end && Date.parse(row.end_at) > start);
            const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
            const delay = window.__reservationQa.rpcDelayForDay[date] || 0;
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            return window.__reservationQa.rpcError ? { data: null, error: window.__reservationQa.rpcError }
                : { data: snapshot, error: null };
        },
        auth: {
            getSession: async () => ({ data: { session: { user: { id: 'qa-user' } } } }),
            getUser: async () => ({ data: { user: { id: 'qa-user' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => ({}),
        },
    };
}

function courtDataFixture() {
    const courts = [
        { id: 1, name: 'Basketball', sportName: 'Basketball', sportSlug: 'basketball',
            quantity: 2, unit: 'courts', rate: 200, rateUnit: '/hr', status: 'available', imageUrl: null },
        { id: 2, name: 'Badminton', sportName: 'Badminton', sportSlug: 'badminton',
            quantity: 1, unit: 'courts', rate: 100, rateUnit: '/hr', status: 'available', imageUrl: null },
    ];
    window.InigoCourtsData = {
        getCourts: async () => courts,
        getSports: async () => [{ id: 1, name: 'Basketball', slug: 'basketball' }, { id: 2, name: 'Badminton', slug: 'badminton' }],
        resolveCourtUnits: court => ({ pickerLabel: 'Choose a court', units: court.quantity > 1
            ? [{ label: 'Court 1', imageUrl: null }, { label: 'Court 2', imageUrl: null }]
            : [{ label: 'Court 1', imageUrl: null }] }),
        monogramFor: () => 'BB',
        slugify: text => String(text).toLowerCase().replace(/\s+/g, '-'),
    };
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        async function setup(role, rows, insertError = null) {
            const context = await browser.newContext({ timezoneId: 'Asia/Manila', viewport: { width: 1280, height: 900 } });
            const page = await context.newPage();
            page.setDefaultTimeout(12000);
            await page.clock.install({ time: new Date(fixedNow) });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route(/^https:\/\//, route => route.abort());
            await page.route('**/includes/loadingOverlay.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `window.__qaToasts=[];window.InigoLoading={show(){},hide(){}};window.InigoToast={show:(message,isError)=>window.__qaToasts.push({message,isError:!!isError})};` }));
            await page.route('**/Config/supabaseClient.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `(${clientFixture})(${JSON.stringify({ rows, insertError })});` }));
            await page.route('**/includes/authGuard.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `window.inigosyncProfile={id:'qa-user',role:${JSON.stringify(role)},status:'active',full_name:'QA User',email:'qa@example.test'};document.addEventListener('DOMContentLoaded',()=>{window.InigoLoading?.hide();document.documentElement.classList.remove('inigo-auth-pending');document.dispatchEvent(new CustomEvent('inigosync:profile-ready',{detail:window.inigosyncProfile}));});` }));
            await page.route('**/includes/courtsData.js', route => route.fulfill({ contentType: 'application/javascript', body: `(${courtDataFixture})();` }));
            await page.route('**/includes/appSettings.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `window.InigoAppSettings={DEFAULT_SETTINGS:{downpaymentPct:50},getSettings:async()=>({downpaymentPct:50})};` }));
            await page.goto(base + (role === 'customer' ? 'user_dashboard.html' : 'staff_dashboard.html'), { waitUntil: 'domcontentloaded' });
            return { page, context, errors };
        }
        const values = locator => locator.evaluate(select => Array.from(select.options).map(option => option.value).filter(Boolean));
        async function customerReadyToSubmit(page) {
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
        }
        async function staffReadyToSubmit(page) {
            await page.locator('[data-staff-nav="walkin"]').first().click();
            await page.locator('[data-staff-walkin-name]').fill('QA Walk-In');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-sport="1"]').click();
            await page.locator('[data-staff-walkin-unit-select]').selectOption('Court 2');
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => Array.from(document.querySelector('[data-staff-walkin-from]').options).some(o => o.value === '10'));
            await page.locator('[data-staff-walkin-from]').selectOption('10');
            await page.locator('[data-staff-walkin-to]').selectOption('10');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-next]').click();
        }

        // Customer: a named unit occupies only itself, and a legacy missing unit occupies the whole court.
        for (const [label, rows, court1Free, court2Free] of [
            ['named online', [occupied('online', 'Basketball', 'Court 1', tomorrow, 10)], false, true],
            ['named walk-in', [occupied('walkin', 'Basketball', 'Court 1', tomorrow, 10)], false, true],
            ['legacy no unit', [occupied('online', 'Basketball', null, tomorrow, 10)], false, false],
            ['blank unit', [occupied('walkin', 'Basketball', '   ', tomorrow, 10)], false, false],
            ['cross-midnight', [{ ...occupied('online', 'Basketball', 'Court 1', tomorrow, 10),
                time_date: `${day}T23:00:00+08:00`, end_at: `${tomorrow}T11:00:00+08:00` }], false, true],
            ['cancelled', [occupied('online', 'Basketball', 'Court 1', tomorrow, 10, 'cancelled')], true, true],
        ]) {
            const { page, context, errors } = await setup('customer', rows);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => !document.querySelector('[data-dash-book-from]').disabled);
            const unitSelect = page.locator('[data-dash-book-unit-select]');
            assert.equal((await values(page.locator('[data-dash-book-from]'))).includes('10'), court1Free, `${label}: Court 1`);
            await page.locator('[data-dash-book-back]').click();
            await unitSelect.selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.waitForFunction(() => !document.querySelector('[data-dash-book-from]').disabled);
            assert.equal((await values(page.locator('[data-dash-book-from]'))).includes('10'), court2Free, `${label}: Court 2`);
            assert.deepEqual(errors, [], `${label}: browser errors`);
            await context.close();
        }

        // Customer save: occupied Court 1 leaves Court 2 bookable and the saved row keeps payment pending.
        {
            const { page, context, errors } = await setup('customer', [occupied('online', 'Basketball', 'Court 1', tomorrow, 10)]);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert' && c.table === 'booking'));
            const writes = await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert' && c.table === 'booking'));
            assert.equal(writes.length, 1);
            assert.equal(writes[0].payload.courts, 'Basketball');
            assert.equal(writes[0].payload.court_unit, 'Court 2');
            assert.equal(writes[0].payload.status, 'pending');
            assert.equal(writes[0].payload.payment_option, 'downpayment');
            assert.equal(writes[0].payload.amount_total, 200);
            assert.equal(writes[0].payload.amount_paid, undefined);
            assert.deepEqual(errors, [], 'customer save: browser errors');
            await context.close();
        }

        // Staff: a named online reservation leaves the other unit open; a no-unit row blocks both.
        for (const [label, rows, court1Free, court2Free] of [
            ['named online', [occupied('online', 'Basketball', 'Court 1', day, 10)], false, true],
            ['legacy no unit', [occupied('walkin', 'Basketball', null, day, 10)], false, false],
            ['blank unit', [occupied('walkin', 'Basketball', '   ', day, 10)], false, false],
        ]) {
            const { page, context, errors } = await setup('staff', rows);
            await page.locator('[data-staff-nav="walkin"]').first().click();
            await page.locator('[data-staff-walkin-name]').fill('QA Walk-In');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-sport="1"]').click();
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => !document.querySelector('[data-staff-walkin-from]').disabled);
            assert.equal((await values(page.locator('[data-staff-walkin-from]'))).includes('10'), court1Free, `${label}: staff Court 1`);
            await page.locator('[data-staff-walkin-back]').click();
            await page.locator('[data-staff-walkin-unit-select]').selectOption('Court 2');
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => !document.querySelector('[data-staff-walkin-from]').disabled);
            assert.equal((await values(page.locator('[data-staff-walkin-from]'))).includes('10'), court2Free, `${label}: staff Court 2`);
            assert.deepEqual(errors, [], `${label}: staff browser errors`);
            await context.close();
        }

        // Staff save preserves court precision and the existing desk-payment payload.
        {
            const { page, context, errors } = await setup('staff', [occupied('online', 'Basketball', 'Court 1', day, 10)]);
            await page.locator('[data-staff-nav="walkin"]').first().click();
            await page.locator('[data-staff-walkin-name]').fill('QA Walk-In');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-sport="1"]').click();
            await page.locator('[data-staff-walkin-unit-select]').selectOption('Court 2');
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => Array.from(document.querySelector('[data-staff-walkin-from]').options).some(o => o.value === '10'));
            await page.locator('[data-staff-walkin-from]').selectOption('10');
            await page.locator('[data-staff-walkin-to]').selectOption('10');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-save]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert' && c.table === 'walk_in_booking'));
            const writes = await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert' && c.table === 'walk_in_booking'));
            assert.equal(writes.length, 1);
            assert.equal(writes[0].payload.courts, 'Basketball');
            assert.equal(writes[0].payload.court_unit, 'Court 2');
            assert.equal(writes[0].payload.status, 'pending');
            assert.equal(writes[0].payload.payment_method, 'Cash');
            assert.equal(writes[0].payload.amount_total, 200);
            assert.equal(writes[0].payload.amount_paid, 200);
            assert.deepEqual(errors, [], 'staff save: browser errors');
            await context.close();
        }

        // Staff schedule reflects saved active rows per unit on a future date.
        {
            const { page, context, errors } = await setup('staff', [
                occupied('online', 'Basketball', 'Court 1', tomorrow, 10),
                occupied('walkin', 'Basketball', 'Court 2', tomorrow, 10),
            ]);
            await page.locator('[data-staff-nav="schedule"]').first().click();
            await page.locator('[data-staff-schedule-date]').fill(tomorrow);
            await page.waitForFunction(() => document.querySelector('[data-staff-schedule-grid] tbody')?.textContent.includes('Basketball'));
            const cell = async label => page.locator('[data-staff-schedule-grid] tbody tr', { hasText: label }).locator('td').nth(3).innerText();
            assert.equal(await cell('Basketball — Court 1'), 'Booked');
            assert.equal(await cell('Basketball — Court 2'), 'Booked');
            assert.equal(await cell('Badminton'), 'Open');
            assert.deepEqual(errors, [], 'staff schedule: browser errors');
            await context.close();
        }

        // Availability API errors close the pickers instead of offering unverified hours.
        for (const role of ['customer', 'staff']) {
            const { page, context, errors } = await setup(role, []);
            await page.evaluate(() => { window.__reservationQa.rpcError = { code: '08006', message: 'Fixture network failure' }; });
            if (role === 'customer') {
                await page.locator('[data-dash-nav="booking"]').first().click();
                await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
                await page.locator('[data-dash-book-next]').click();
                await page.locator('[data-dash-book-date]').fill(tomorrow);
                await page.waitForFunction(() => document.querySelector('[data-dash-book-open-windows]')?.textContent.includes('Could not check live availability'));
                assert(await page.locator('[data-dash-book-from]').isDisabled());
            } else {
                await page.locator('[data-staff-nav="walkin"]').first().click();
                await page.locator('[data-staff-walkin-name]').fill('QA Walk-In');
                await page.locator('[data-staff-walkin-next]').click();
                await page.locator('[data-staff-walkin-sport="1"]').click();
                await page.locator('[data-staff-walkin-next]').click();
                await page.waitForFunction(() => document.querySelector('[data-staff-walkin-open-windows]')?.textContent.includes('Could not check live availability'));
                assert(await page.locator('[data-staff-walkin-from]').isDisabled());
            }
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 0);
            assert.deepEqual(errors, [], `${role} picker API failure: browser errors`);
            await context.close();
        }

        // A failed final recheck never sends an insert from either wizard.
        for (const role of ['customer', 'staff']) {
            const { page, context, errors } = await setup(role, []);
            if (role === 'customer') await customerReadyToSubmit(page);
            else await staffReadyToSubmit(page);
            await page.evaluate(() => { window.__reservationQa.rpcError = { code: '08006', message: 'Fixture network failure' }; });
            await page.locator(role === 'customer' ? '[data-dash-book-submit]' : '[data-staff-walkin-save]').click();
            await page.waitForFunction(() => window.__qaToasts.some(t => t.message.includes('Could not verify live availability')));
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 0);
            assert.deepEqual(errors, [], `${role} submit API failure: browser errors`);
            await context.close();
        }

        // The database's 23P01 race response stays a visible failure and refreshes availability.
        for (const role of ['customer', 'staff']) {
            const { page, context, errors } = await setup(role, [], { code: '23P01', message: 'Fixture conflict' });
            if (role === 'customer') await customerReadyToSubmit(page);
            else await staffReadyToSubmit(page);
            const before = await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'rpc' && c.name === 'court_occupancy').length);
            await page.locator(role === 'customer' ? '[data-dash-book-submit]' : '[data-staff-walkin-save]').click();
            await page.waitForFunction(() => window.__qaToasts.some(t => t.isError && t.message.includes('just taken')));
            await page.waitForFunction(before => window.__reservationQa.calls.filter(c => c.kind === 'rpc' && c.name === 'court_occupancy').length > before + 1, before);
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 1);
            assert.equal(await page.evaluate(() => window.__reservationQa.data.length), 0);
            if (role === 'staff') assert(await page.locator('[data-staff-walkin-receipt-wrap]').isHidden());
            assert.deepEqual(errors, [], `${role} 23P01: browser errors`);
            await context.close();
        }

        // An older, delayed date response cannot replace a newer date's open hours.
        {
            const { page, context, errors } = await setup('customer', [occupied('online', 'Basketball', 'Court 1', tomorrow, 10)]);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-next]').click();
            await page.evaluate(() => { window.__reservationQa.rpcDelayForDay['2026-09-25'] = 300; });
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.locator('[data-dash-book-date]').fill('2026-09-26');
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.clock.runFor(400);
            assert((await values(page.locator('[data-dash-book-from]'))).includes('10'));
            assert.equal(await page.locator('[data-dash-book-date]').inputValue(), '2026-09-26');
            assert.deepEqual(errors, [], 'stale RPC response: browser errors');
            await context.close();
        }

        console.log('PASS reservation QA UI: occupancy, wildcard, cross-midnight, saves, schedule, payment, API errors, 23P01, stale responses');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
