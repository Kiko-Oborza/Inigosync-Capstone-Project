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
    window.__reservationQa = { data, calls, insertError: options.insertError || null, insertErrorAfter: options.insertErrorAfter,
        insertErrorOnce: options.insertErrorOnce || false, insertDelayMs: options.insertDelayMs || 0,
        authoritativeAmountTotal: options.authoritativeAmountTotal, rpcError: null, rpcDelayForDay: {},
        owner: options.owner || null };
    const result = (table, query) => {
        const ownerData = window.__reservationQa.owner;
        if (query.write === 'insert' || query.write === 'upsert' || query.write === 'delete') {
            calls.push({ kind: query.write, table, payload: query.payload });
            if (window.__reservationQa.insertError && (window.__reservationQa.insertErrorAfter === undefined
                || calls.filter(c => c.kind === 'insert').length > window.__reservationQa.insertErrorAfter)) {
                const error = window.__reservationQa.insertError;
                if (window.__reservationQa.insertErrorOnce) window.__reservationQa.insertError = null;
                return { data: null, error };
            }
            if (ownerData && table === 'court_unit_inventory' && query.write === 'insert') {
                const saved = { ...query.payload, id: `qa-unit-${ownerData.units.length + 1}`, court_unit_resource_map: [] };
                ownerData.units.push(saved);
                return { data: query.one ? { id: saved.id } : [saved], error: null };
            }
            if (ownerData && table === 'physical_court_resource' && query.write === 'insert') {
                const saved = { ...query.payload, id: `qa-resource-${ownerData.resources.length + 1}`, is_active: true };
                ownerData.resources.push(saved);
                return { data: query.one ? { id: saved.id } : [saved], error: null };
            }
            if (ownerData && table === 'court_unit_resource_map' && ['insert', 'upsert'].includes(query.write)) {
                const unit = ownerData.units.find(row => row.id === query.payload.court_unit_id);
                if (unit) unit.court_unit_resource_map.push({ resource_id: query.payload.resource_id });
                return { data: query.payload, error: null };
            }
            if (table === 'booking' || table === 'walk_in_booking') {
                const onlineCount = data.filter(row => row.source === 'online').length;
                const walkinCount = data.filter(row => row.source === 'walkin').length;
                const saved = { ...query.payload, source: table === 'booking' ? 'online' : 'walkin',
                    amount_total: window.__reservationQa.authoritativeAmountTotal ?? query.payload.amount_total,
                    booking_id: 100 + onlineCount + 1, walkin_id: 100 + walkinCount + 1,
                    rate_unit_snapshot: query.payload.rate_quantity > 1 ? '/set' : '/hr' };
                data.push(saved);
                return { data: query.one ? saved : [saved], error: null };
            }
            return { data: [], error: null };
        }
        if (query.write === 'update') {
            calls.push({ kind: 'update', table, payload: query.payload });
            return { data: query.one ? { id: 'qa-updated-row', ...(query.payload || {}) } : [], error: null };
        }
        if (table === 'profiles' && query.one) return { data: window.inigosyncProfile, error: null };
        if (ownerData && table === 'court_unit_inventory' && query.selectOptions?.count === 'exact') {
            const matching = ownerData.units.filter(row => !query.filters?.court_id || String(row.court_id) === String(query.filters.court_id));
            return { data: query.selectOptions.head ? null : matching, count: matching.length, error: null };
        }
        if (ownerData && table === 'court_unit_inventory') return { data: ownerData.units, error: null };
        if (ownerData && table === 'physical_court_resource') return { data: ownerData.resources, error: null };
        if (ownerData && table === 'court') {
            const courts = ownerData.courts.filter(row => !query.filters?.id || String(row.id) === String(query.filters.id));
            return { data: query.one ? courts[0] || null : courts, error: null };
        }
        if (ownerData && table === 'app_settings' && query.one) return { data: { night_rate_starts_at: '18:30:00' }, error: null };
        return { data: [], error: null };
    };
    const from = table => {
        const query = { write: null, payload: null, one: false };
        const chain = {
            select(_columns, options) { query.selectOptions = options || null; return chain; }, eq(column, value) { query.filters = { ...(query.filters || {}), [column]: value }; return chain; }, in() { return chain; },
            gte() { return chain; }, gt() { return chain; }, lte() { return chain; },
            lt() { return chain; }, is() { return chain; }, or() { return chain; },
            order() { return chain; }, limit() { return chain; }, range() { return chain; },
            single() {
                query.one = true;
                const delay = query.write === 'insert' ? window.__reservationQa.insertDelayMs : 0;
                return delay ? new Promise(resolve => setTimeout(() => resolve(result(table, query)), delay))
                    : Promise.resolve(result(table, query));
            },
            maybeSingle() { query.one = true; return Promise.resolve(result(table, query)); },
            insert(payload) { query.write = 'insert'; query.payload = payload; return chain; },
            upsert(payload) { query.write = 'upsert'; query.payload = payload; return chain; },
            delete() { query.write = 'delete'; return chain; },
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
        functions: { invoke: async (name, options) => {
            calls.push({ kind: 'function', name, options });
            if (window.__qaRecordCheckout) await window.__qaRecordCheckout(name, options);
            return { data: { checkout_url: 'https://checkout.paymongo.com/qa' }, error: null };
        } },
        auth: {
            getSession: async () => ({ data: { session: { user: { id: 'qa-user' } } } }),
            getUser: async () => ({ data: { user: { id: 'qa-user' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signOut: async () => ({}),
        },
    };
}

function courtDataFixture(options = {}) {
    const basketballUnits = [
        { id: 'basketball-unit-1', label: 'Court 1', resourceIds: ['physical-court-1'] },
        { id: 'basketball-unit-2', label: 'Court 2', resourceIds: ['basketball2-pickleball-1', 'basketball2-pickleball-2', 'basketball2-pickleball-3'] },
    ];
    if (options.rates) {
        basketballUnits[0].rateDay = 100;
        basketballUnits[0].rateNight = 200;
        basketballUnits[1].rateDay = 300;
        basketballUnits[1].rateNight = 400;
    }
    const duckpinUnits = [{ id: 'duckpin-unit-1', label: 'Lane 1' }];
    if (options.sets) Object.assign(duckpinUnits[0], { rateDay: 100, rateUnit: '/set' });
    const pickleballUnits = Array.from({ length: 10 }, (_, index) => {
        const n = index + 1;
        const resourceId = n <= 3 ? `basketball2-pickleball-${n}`
            : n <= 6 ? `volleyball1-pickleball-${n - 3}`
                : n <= 8 ? `tennis1-pickleball-${n - 6}` : `tennis2-pickleball-${n - 8}`;
        return { id: `pickleball-unit-${n}`, label: `Court ${n}`, resourceIds: [resourceId] };
    });
    const courts = [
        { id: 1, name: 'Basketball', sportName: 'Basketball', sportSlug: 'basketball',
            quantity: 2, unit: 'courts', rate: 200, rateUnit: '/hr', status: 'available', imageUrl: null,
            bookableUnits: basketballUnits },
        { id: 2, name: 'Badminton', sportName: 'Badminton', sportSlug: 'badminton',
            quantity: 1, unit: 'courts', rate: 100, rateUnit: '/hr', status: 'available', imageUrl: null,
            bookableUnits: [{ id: 'badminton-unit-1', label: 'Court 1', resourceIds: ['physical-badminton-1'] }] },
        { id: 3, name: 'Pickleball', sportName: 'Pickleball', sportSlug: 'pickleball',
            quantity: 10, unit: 'courts', rate: null, rateUnit: '/hr', status: 'available', imageUrl: null,
            bookableUnits: pickleballUnits },
        { id: 4, name: 'Bowling — Duckpin', sportName: 'Bowling', sportSlug: 'bowling',
            quantity: 8, unit: 'lanes', rate: null, rateUnit: '/game', status: 'available', imageUrl: null,
            bookableUnits: duckpinUnits },
        { id: 5, name: 'Volleyball', sportName: 'Volleyball', sportSlug: 'volleyball',
            quantity: 1, unit: 'court', rate: 500, rateUnit: '/hr', status: 'available', imageUrl: null,
            bookableUnits: [{ id: 'volleyball-unit-1', label: 'Court 1', resourceIds: ['volleyball1-pickleball-1', 'volleyball1-pickleball-2', 'volleyball1-pickleball-3'] }] },
        { id: 6, name: 'Lawn Tennis', sportName: 'Lawn Tennis', sportSlug: 'lawn-tennis',
            quantity: 3, unit: 'courts', rate: 200, rateUnit: '/hr', status: 'available', imageUrl: null,
            bookableUnits: [
                { id: 'tennis-unit-1', label: 'Court 1', resourceIds: ['tennis1-pickleball-1', 'tennis1-pickleball-2'] },
                { id: 'tennis-unit-2', label: 'Court 2', resourceIds: ['tennis2-pickleball-1', 'tennis2-pickleball-2'] },
                { id: 'tennis-unit-3', label: 'Court 3', resourceIds: ['tennis3-resource'] },
            ] },
    ];
    if (options.inventoryUnavailable) courts.forEach(court => { court.inventoryLoadFailed = true; });
    if (options.emptyPickleballInventory) {
        courts.find(court => court.sportSlug === 'pickleball').bookableUnits = [];
    }
    window.InigoCourtsData = {
        getCourts: async () => courts,
        getSports: async () => [{ id: 1, name: 'Basketball', slug: 'basketball' }, { id: 2, name: 'Badminton', slug: 'badminton' }],
        resolveCourtUnits: court => ({ pickerLabel: 'Choose a court', units: court.bookableUnits
            || (court.quantity > 1 ? [{ label: 'Court 1', imageUrl: null }, { label: 'Court 2', imageUrl: null }]
                : [{ label: 'Court 1', imageUrl: null }]) }),
        invalidateCourts: () => {},
        monogramFor: () => 'BB',
        slugify: text => String(text).toLowerCase().replace(/\s+/g, '-'),
        rateHint: court => {
            const rates = (court.bookableUnits || []).flatMap(unit => [unit.rateDay, unit.rateNight].filter(value => typeof value === 'number'));
            return rates.length ? `From ₱${Math.min(...rates)}${court.rateUnit || '/hr'}` : null;
        },
    };
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        async function setup(role, rows, insertError = null, inventoryUnavailable = false, rates = false, sets = false, authoritativeAmountTotal = undefined, insertErrorAfter = undefined, insertDelayMs = 0, insertErrorOnce = false, ownerData = null, emptyPickleballInventory = false) {
            const context = await browser.newContext({ timezoneId: 'Asia/Manila', viewport: { width: 1280, height: 900 } });
            const page = await context.newPage();
            page.setDefaultTimeout(12000);
            const checkoutCalls = [];
            await page.exposeFunction('__qaRecordCheckout', (name, options) => checkoutCalls.push({ name, options }));
            await page.clock.install({ time: new Date(fixedNow) });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route(/^https:\/\//, route => route.abort());
            await page.route('**/includes/loadingOverlay.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `window.__qaToasts=[];window.InigoLoading={show(){},hide(){}};window.InigoToast={show:(message,isError)=>window.__qaToasts.push({message,isError:!!isError})};` }));
            await page.route('**/Config/supabaseClient.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `(${clientFixture})(${JSON.stringify({ rows, insertError, insertErrorAfter, insertDelayMs, insertErrorOnce, authoritativeAmountTotal, owner: ownerData })});` }));
            await page.route('**/includes/authGuard.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `window.inigosyncProfile={id:'qa-user',role:${JSON.stringify(role)},status:'active',full_name:'QA User',email:'qa@example.test'};document.addEventListener('DOMContentLoaded',()=>{window.InigoLoading?.hide();document.documentElement.classList.remove('inigo-auth-pending');document.dispatchEvent(new CustomEvent('inigosync:profile-ready',{detail:window.inigosyncProfile}));});` }));
            await page.route('**/includes/courtsData.js', route => route.fulfill({ contentType: 'application/javascript', body: `(${courtDataFixture})(${JSON.stringify({ inventoryUnavailable, rates, sets, emptyPickleballInventory })});` }));
            await page.route('**/includes/appSettings.js', route => route.fulfill({ contentType: 'application/javascript',
                body: `window.InigoAppSettings={DEFAULT_SETTINGS:{downpaymentPct:50},getSettings:async()=>({downpaymentPct:50,nightRateStartsAt:'18:30'})};` }));
            const dashboard = role === 'customer' ? 'user_dashboard.html' : role === 'admin' ? 'owner_dashboard.html' : 'staff_dashboard.html';
            await page.goto(base + dashboard, { waitUntil: 'domcontentloaded' });
            return { page, context, errors, checkoutCalls };
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

        // Physical-resource projection: a Basketball Court 2 hold returned
        // under all three linked Pickleball zones closes each zone for both
        // customer reservations and staff walk-ins.
        {
            const sharedHolds = ['Court 1', 'Court 2', 'Court 3'].map(unit => occupied('online', 'Pickleball', unit, tomorrow, 10));
            const { page, context, errors } = await setup('customer', sharedHolds);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-select]').selectOption('Pickleball');
            for (const unit of ['Court 1', 'Court 2', 'Court 3']) {
                await page.locator('[data-dash-book-unit-select]').selectOption({ label: unit });
                await page.locator('[data-dash-book-next]').click();
                await page.locator('[data-dash-book-date]').fill(tomorrow);
                await page.waitForFunction(() => !document.querySelector('[data-dash-book-from]').disabled);
                assert.equal((await values(page.locator('[data-dash-book-from]'))).includes('10'), false, `customer sees Basketball Court 2 block ${unit}`);
                await page.locator('[data-dash-book-back]').click();
            }
            assert.deepEqual(errors, [], 'customer shared resource: browser errors');
            await context.close();
        }
        {
            const sharedHolds = ['Court 1', 'Court 2', 'Court 3'].map(unit => occupied('online', 'Pickleball', unit, day, 10));
            const { page, context, errors } = await setup('staff', sharedHolds);
            await page.locator('[data-staff-nav="walkin"]').first().click();
            await page.locator('[data-staff-walkin-name]').fill('QA Walk-In');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-sport="3"]').click();
            await page.locator('[data-staff-walkin-unit-select]').selectOption('Court 2');
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => !document.querySelector('[data-staff-walkin-from]').disabled);
            assert.equal((await values(page.locator('[data-staff-walkin-from]'))).includes('10'), false, 'staff sees Basketball Court 2 block its linked Pickleball zones');
            assert.deepEqual(errors, [], 'staff shared resource: browser errors');
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
            assert.equal(writes[0].payload.court_listing_id, 1);
            assert.equal(writes[0].payload.court_unit, 'Court 2');
            assert.equal(writes[0].payload.court_unit_inventory_id, 'basketball-unit-2');
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
            assert.equal(writes[0].payload.court_listing_id, 1);
            assert.equal(writes[0].payload.court_unit, 'Court 2');
            assert.equal(writes[0].payload.court_unit_inventory_id, 'basketball-unit-2');
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

        // Inventory-load failures hide booking choices instead of authorizing
        // quantity-derived fallback courts in either customer or staff flows.
        for (const role of ['customer', 'staff']) {
            const { page, context, errors } = await setup(role, [], null, true);
            if (role === 'customer') {
                await page.locator('[data-dash-nav="booking"]').first().evaluate(el => el.click());
                const selectable = await page.locator('[data-dash-book-select] option').evaluateAll(options => options.filter(o => o.value).length);
                assert.equal(selectable, 0, 'customer sees no bookable courts when authoritative inventory is unavailable');
            } else {
                await page.locator('[data-staff-nav="walkin"]').first().evaluate(el => el.click());
                assert.equal(await page.locator('[data-staff-walkin-sport]').count(), 0, 'staff sees no walk-in court choices when inventory is unavailable');
            }
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 0);
            assert.deepEqual(errors, [], `${role} unavailable inventory: browser errors`);
            await context.close();
        }

        // A successfully loaded but unverified empty inventory stays out of
        // customer and staff selectors, even while other sports remain bookable.
        for (const role of ['customer', 'staff']) {
            const { page, context, errors } = await setup(role, [], null, false, false, false, undefined, undefined, 0, false, null, true);
            if (role === 'customer') {
                await page.locator('[data-dash-nav="booking"]').first().evaluate(el => el.click());
                const labels = await page.locator('[data-dash-book-select] option').allTextContents();
                assert(!labels.some(label => label.includes('Pickleball')), 'customer does not see unverified Pickleball inventory as bookable');
                assert(labels.some(label => label.includes('Basketball')), 'verified sports remain bookable');
            } else {
                await page.locator('[data-staff-nav="walkin"]').first().evaluate(el => el.click());
                const labels = await page.locator('[data-staff-walkin-sport]').allTextContents();
                assert(!labels.some(label => label.includes('Pickleball')), 'staff does not see unverified Pickleball inventory as bookable');
                assert(labels.some(label => label.includes('Basketball')), 'verified sports remain bookable for walk-ins');
            }
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 0);
            assert.deepEqual(errors, [], `${role} unverified empty inventory: browser errors`);
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

        // Booking controls and buttons stay inside the page width at common
        // phone, tablet, and desktop breakpoints.
        for (const role of ['customer', 'staff']) {
            for (const width of [320, 375, 768, 1024, 1440]) {
                const { page, context, errors } = await setup(role, []);
                await page.setViewportSize({ width, height: 900 });
                await page.locator(role === 'customer' ? '[data-dash-nav="booking"]' : '[data-staff-nav="walkin"]').first().evaluate(el => el.click());
                const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
                assert(dimensions.page <= dimensions.viewport + 1, `${role} page overflows horizontally at ${width}px: ${JSON.stringify(dimensions)}`);
                assert.deepEqual(errors, [], `${role} responsive ${width}px: browser errors`);
                await context.close();
            }
        }

        // Customers can compose separate sports/courts with individual times,
        // while cart items mapped to one physical resource cannot overlap.
        {
            const { page, context, errors } = await setup('customer', [], null, false, false, false, undefined, undefined, 350);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-add]').click();
            assert.equal(await page.locator('[data-dash-book-cart-count]').innerText(), '1 item');

            await page.locator('[data-dash-book-select]').selectOption('Badminton');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill('2026-09-26');
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '11'));
            await page.locator('[data-dash-book-from]').selectOption('11');
            await page.locator('[data-dash-book-to]').selectOption('12');
            await page.locator('[data-dash-book-next]').click();
            assert.equal(await page.locator('[data-dash-summary-time]').innerText(), '11:00 AM – 1:00 PM · 2 hrs');
            await page.locator('[data-dash-book-submit]').click();
            assert(await page.locator('[data-dash-book-cart-remove]').isDisabled(), 'cart removal is frozen while inserts are pending');
            assert(await page.locator('[data-dash-book-submit]').isDisabled(), 'second submit is frozen while inserts are pending');
            await page.waitForFunction(() => window.__reservationQa.calls.filter(c => c.kind === 'insert' && c.table === 'booking').length === 2);
            const saved = await page.evaluate(() => window.__reservationQa.data.filter(row => row.source === 'online'));
            assert.equal(saved.length, 2);
            assert.equal(saved[0].sports, 'Basketball');
            assert.equal(saved[0].time_date, '2026-09-25T02:00:00.000Z');
            assert.equal(saved[1].sports, 'Badminton');
            assert.equal(saved[1].time_date, '2026-09-26T03:00:00.000Z');
            assert.equal(saved[1].duration_minutes, 120);
            assert.deepEqual(errors, [], 'customer multi-item bookings: browser errors');
            await context.close();
        }
        {
            const { page, context, errors } = await setup('customer', [], { code: '23P01', message: 'Fixture conflict' }, false, false, false, undefined, 1, 0, true);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-add]').click();
            await page.locator('[data-dash-book-select]').selectOption('Badminton');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill('2026-09-26');
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '11'));
            await page.locator('[data-dash-book-from]').selectOption('11');
            await page.locator('[data-dash-book-to]').selectOption('12');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForFunction(() => window.__qaToasts.some(t => t.isError && t.message.includes('1 booking saved')));
            assert.equal(await page.evaluate(() => window.__reservationQa.data.filter(row => row.source === 'online').length), 1);
            assert.equal(await page.locator('[data-dash-book-submit]').innerText(), 'Request Booking');
            assert(await page.locator('[data-dash-book-submit]').isEnabled(), 'failed current item is retryable');
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForFunction(() => window.__reservationQa.data.filter(row => row.source === 'online').length === 2);
            const sports = await page.evaluate(() => window.__reservationQa.data.filter(row => row.source === 'online').map(row => row.sports).sort());
            assert.deepEqual(sports, ['Badminton', 'Basketball'], 'retry after one-item conflict does not duplicate the saved booking');
            assert.deepEqual(errors, [], 'customer partial cart retry: browser errors');
            await context.close();
        }
        {
            const { page, context, errors } = await setup('customer', []);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-add]').click();
            await page.locator('[data-dash-book-select]').selectOption('Pickleball');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForFunction(() => window.__qaToasts.some(t => t.isError && t.message.includes('same physical court')));
            assert.equal(await page.locator('[data-dash-book-cart-count]').innerText(), '1 item');
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 0);
            await page.setViewportSize({ width: 320, height: 900 });
            const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }));
            assert(dimensions.page <= dimensions.viewport + 1, `booking list overflows horizontally at 320px: ${JSON.stringify(dimensions)}`);
            assert.deepEqual(errors, [], 'customer shared-resource cart: browser errors');
            await context.close();
        }
        {
            const { page, context, errors } = await setup('customer', []);
            await page.locator('[data-dash-nav="booking"]').first().click();
            for (const unit of ['Court 1', 'Court 2']) {
                await page.locator('[data-dash-book-select]').selectOption('Pickleball');
                await page.locator('[data-dash-book-unit-select]').selectOption({ label: unit });
                await page.locator('[data-dash-book-next]').click();
                await page.locator('[data-dash-book-date]').fill(tomorrow);
                await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
                await page.locator('[data-dash-book-from]').selectOption('10');
                await page.locator('[data-dash-book-to]').selectOption('10');
                await page.locator('[data-dash-book-next]').click();
                await page.locator('[data-dash-book-add]').click();
            }
            assert.equal(await page.locator('[data-dash-book-cart-count]').innerText(), '2 items', 'separate Pickleball partitions can be queued at the same time');
            await page.locator('[data-dash-book-select]').selectOption('Basketball');
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-add]').click();
            await page.waitForFunction(() => window.__qaToasts.some(t => t.isError && t.message.includes('same physical court')));
            assert.equal(await page.locator('[data-dash-book-cart-count]').innerText(), '2 items', 'full Basketball Court 2 conflicts with every Pickleball partition on it');
            assert.equal(await page.evaluate(() => window.__reservationQa.calls.filter(c => c.kind === 'insert').length), 0);
            assert.deepEqual(errors, [], 'capacity-partition cart: browser errors');
            await context.close();
        }

        // The saved database amount governs both the walk-in receipt and the
        // customer's payment handoff if rates changed while either wizard was open.
        {
            const { page, context, errors } = await setup('staff', [], null, false, true, false, 725);
            await staffReadyToSubmit(page);
            await page.locator('[data-staff-walkin-save]').click();
            await page.locator('[data-staff-walkin-receipt]').waitFor();
            assert((await page.locator('[data-staff-walkin-receipt]').innerText()).includes('₱725.00'));
            assert((await page.locator('[data-staff-walkin-receipt]').innerText()).includes('Saved reservation total'));
            assert.deepEqual(errors, [], 'staff saved-price receipt: browser errors');
            await context.close();
        }
        {
            const { page, context, errors, checkoutCalls } = await setup('customer', [], null, false, true, false, 725);
            const confirmMessages = [];
            page.on('dialog', async dialog => { confirmMessages.push(dialog.message()); await dialog.accept(); });
            await customerReadyToSubmit(page);
            await page.locator('[data-dash-pay-mode="online"]').check();
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForTimeout(100);
            assert(confirmMessages.some(message => message.includes('₱725.00')));
            assert.equal(checkoutCalls.length, 1);
            assert.equal(checkoutCalls[0].name, 'paymongo-checkout');
            assert.equal(checkoutCalls[0].options.body.booking_id, 101);
            assert.deepEqual(errors, [], 'customer saved-price checkout: browser errors');
            await context.close();
        }

        // Day/night amounts come from the chosen unit; a range crossing the
        // configured 18:30 boundary prorates the one affected hour.
        {
            const { page, context, errors } = await setup('customer', [], null, false, true);
            await page.locator('[data-dash-nav="booking"]').first().click();
            assert.match(await page.locator('[data-dash-book-select] option').first().innerText(), /From ₱100\/hr/);
            await page.locator('[data-dash-book-unit-select] option').first().waitFor({ state: 'attached' });
            await page.locator('[data-dash-book-unit-select]').selectOption({ label: 'Court 2' });
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '17'));
            await page.locator('[data-dash-book-from]').selectOption('17');
            await page.locator('[data-dash-book-to]').selectOption('18');
            await page.locator('[data-dash-book-next]').click();
            assert.equal(await page.locator('[data-dash-summary-total]').innerText(), '₱325.00');
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert' && c.table === 'booking'));
            const row = await page.evaluate(() => window.__reservationQa.calls.find(c => c.kind === 'insert' && c.table === 'booking').payload);
            assert.equal(row.court_unit_inventory_id, 'basketball-unit-2');
            assert.equal(row.amount_total, 650);
            assert.equal(row.rate_quantity, 1);
            assert.deepEqual(errors, [], 'customer day/night quote: browser errors');
            await context.close();
        }
        {
            const { page, context, errors } = await setup('staff', [], null, false, true);
            await page.locator('[data-staff-nav="walkin"]').first().click();
            await page.locator('[data-staff-walkin-name]').fill('QA Rate Walk-In');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-sport="1"]').click();
            await page.locator('[data-staff-walkin-unit-select]').selectOption('Court 2');
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => Array.from(document.querySelector('[data-staff-walkin-from]').options).some(o => o.value === '17'));
            await page.locator('[data-staff-walkin-from]').selectOption('17');
            await page.locator('[data-staff-walkin-to]').selectOption('18');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-next]').click();
            assert.equal(await page.locator('[data-staff-walkin-summary-total]').innerText(), '₱650.00');
            await page.locator('[data-staff-walkin-save]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert' && c.table === 'walk_in_booking'));
            const row = await page.evaluate(() => window.__reservationQa.calls.find(c => c.kind === 'insert' && c.table === 'walk_in_booking').payload);
            assert.equal(row.court_unit_inventory_id, 'basketball-unit-2');
            assert.equal(row.amount_total, 650);
            assert.equal(row.amount_paid, 650);
            assert.equal(row.rate_quantity, 1);
            assert.deepEqual(errors, [], 'staff day/night quote: browser errors');
            await context.close();
        }
        // Bowling is priced by purchased sets, independently of the lane's
        // reserved hour; venue payment remains available and online stays off.
        {
            const { page, context, errors } = await setup('customer', [], null, false, false, true);
            await page.locator('[data-dash-nav="booking"]').first().click();
            await page.locator('[data-dash-book-select]').selectOption('Bowling — Duckpin');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-book-date]').fill(tomorrow);
            await page.waitForFunction(() => Array.from(document.querySelector('[data-dash-book-from]').options).some(o => o.value === '10'));
            await page.locator('[data-dash-book-from]').selectOption('10');
            await page.locator('[data-dash-book-to]').selectOption('10');
            await page.locator('[data-dash-book-next]').click();
            await page.locator('[data-dash-rate-quantity]').fill('3');
            assert.equal(await page.locator('[data-dash-summary-total]').innerText(), '₱150.00');
            assert(await page.locator('[data-dash-pay-mode="online"]').isDisabled());
            await page.locator('[data-dash-book-submit]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert' && c.table === 'booking'));
            const row = await page.evaluate(() => window.__reservationQa.calls.find(c => c.kind === 'insert' && c.table === 'booking').payload);
            assert.equal(row.court_unit_inventory_id, 'duckpin-unit-1');
            assert.equal(row.rate_quantity, 3);
            assert.equal(row.amount_total, 300);
            assert.deepEqual(errors, [], 'customer per-set booking: browser errors');
            await context.close();
        }
        {
            const { page, context, errors } = await setup('staff', [], null, false, false, true);
            await page.locator('[data-staff-nav="walkin"]').first().click();
            await page.locator('[data-staff-walkin-name]').fill('QA Bowling Walk-In');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-sport="4"]').click();
            await page.locator('[data-staff-walkin-next]').click();
            await page.waitForFunction(() => Array.from(document.querySelector('[data-staff-walkin-from]').options).some(o => o.value === '10'));
            await page.locator('[data-staff-walkin-from]').selectOption('10');
            await page.locator('[data-staff-walkin-to]').selectOption('10');
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-walkin-next]').click();
            await page.locator('[data-staff-rate-quantity]').fill('3');
            assert.equal(await page.locator('[data-staff-walkin-summary-total]').innerText(), '₱300.00');
            await page.locator('[data-staff-walkin-save]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert' && c.table === 'walk_in_booking'));
            const row = await page.evaluate(() => window.__reservationQa.calls.find(c => c.kind === 'insert' && c.table === 'walk_in_booking').payload);
            assert.equal(row.court_unit_inventory_id, 'duckpin-unit-1');
            assert.equal(row.rate_quantity, 3);
            assert.equal(row.amount_total, 300);
            assert.equal(row.amount_paid, 300);
            assert.deepEqual(errors, [], 'staff per-set booking: browser errors');
            await context.close();
        }

        // Owner: court availability is edited inside each sport. Per-unit
        // rates and cross-sport blocking are visible in the selected listing.
        {
            const ownerData = {
                units: [
                    { id: 'basketball-unit-1', court_id: 1, label: 'Court 1', pricing_tier: 'old',
                        rate_day: 700, rate_night: 1000, rate_unit: '/hr', is_active: true, inventory_verified: true,
                        court: { id: 1, name: 'Basketball', unit: 'courts' }, court_unit_resource_map: [{ resource_id: 'physical-basketball-1' }] },
                    { id: 'basketball-unit-2', court_id: 1, label: 'Court 2', pricing_tier: 'new',
                        rate_day: 1300, rate_night: 1300, rate_unit: '/hr', is_active: true, inventory_verified: true,
                        court: { id: 1, name: 'Basketball', unit: 'courts' }, court_unit_resource_map: [
                            { resource_id: 'basketball2-pickleball-1' }, { resource_id: 'basketball2-pickleball-2' }, { resource_id: 'basketball2-pickleball-3' }] },
                    ...Array.from({ length: 10 }, (_, index) => {
                        const n = index + 1;
                        const resourceId = n <= 3 ? `basketball2-pickleball-${n}` : `pickleball-private-${n}`;
                        return { id: `pickleball-unit-${n}`, court_id: 3, label: `Court ${n}`, pricing_tier: 'old',
                        rate_day: 200, rate_night: 300, rate_unit: '/hr', is_active: true, inventory_verified: true,
                        court: { id: 3, name: 'Pickleball', unit: 'courts' }, court_unit_resource_map: [{ resource_id: resourceId }] };
                    }),
                ],
                resources: [
                    { id: 'physical-basketball-1', name: 'Basketball Court 1', is_active: true },
                    ...Array.from({ length: 3 }, (_, i) => ({ id: `basketball2-pickleball-${i + 1}`, name: `Basketball Court 2 Pickleball slot ${i + 1}`, is_active: true })),
                    ...Array.from({ length: 7 }, (_, i) => ({ id: `pickleball-private-${i + 4}`, name: `Pickleball Court ${i + 4}`, is_active: true })),
                ],
                courts: [
                    { id: 1, name: 'Basketball', unit: 'courts' },
                    { id: 3, name: 'Pickleball', unit: 'courts' },
                ],
            };
            const { page, context, errors } = await setup('admin', [], null, false, true, false, undefined, undefined, 0, false, ownerData);
            await page.locator('[data-admin-nav="courts"]').click();
            assert.equal(await page.locator('[data-admin-resource-rows]').count(), 1);
            assert.equal(await page.locator('[data-admin-resource-rows]').isVisible(), false,
                'unit controls should stay inside the selected sport editor');
            assert((await page.locator('[data-court-id="1"]').innerText()).includes('From ₱100/hr'),
                'listing card should show the configured unit rate');
            await page.locator('[data-court-id="1"] [data-admin-court-edit]').click();
            const hostRow = page.locator('[data-admin-resource-unit="basketball-unit-2"]');
            await hostRow.waitFor({ state: 'attached' });
            await hostRow.locator('summary').click();
            for (const slot of [1, 2, 3]) {
                assert.equal(await hostRow.locator(`[data-resource-map="basketball2-pickleball-${slot}"]`).isChecked(), true,
                    `Basketball Court 2 should reserve its separate Pickleball capacity slot ${slot}`);
            }
            await page.locator('[data-admin-court-modal-close]').first().click();
            await page.locator('[data-admin-court-modal]').waitFor({ state: 'hidden' });
            await page.locator('[data-court-id="3"] [data-admin-court-edit]').click();
            assert.equal(await page.locator('[data-admin-unit-manager]').isVisible(), true);
            const row = page.locator('[data-admin-resource-unit="pickleball-unit-1"]');
            await row.waitFor({ state: 'attached' });
            const resourceMap = row.locator('[data-resource-map="physical-basketball-1"]');
            await row.locator('summary').click();
            assert.equal(await resourceMap.isChecked(), false, 'Pickleball unit controls do not start with the other basketball court linked');
            const managedHostLink = row.locator('[data-resource-map="basketball2-pickleball-1"]');
            assert.equal(await managedHostLink.isDisabled(), true,
                'a capacity-host link is managed from the larger court editor');
            assert((await resourceMap.getAttribute('aria-label')).includes('Basketball Court 1'));
            await resourceMap.check();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'upsert'
                && c.table === 'court_unit_resource_map'
                && c.payload.court_unit_id === 'pickleball-unit-1'
                && c.payload.resource_id === 'physical-basketball-1'));
            assert.equal(await row.locator('[data-resource-map="basketball2-pickleball-2"]').count(), 0,
                'a Pickleball unit must not be linked to a sibling Pickleball capacity slot');
            await row.locator('[data-rate-day]').fill('225');
            await row.locator('[data-rate-night]').fill('325');
            await row.locator('[data-rate-save]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'update'
                && c.table === 'court_unit_inventory' && c.payload.rate_day === 225 && c.payload.rate_night === 325));
            assert.equal(await managedHostLink.isDisabled(), true,
                'saving rates must not unlock a connection managed by the capacity-host court');
            await page.locator('[data-admin-unit-label]').fill('Court 11');
            await page.locator('[data-admin-unit-add] button[type="submit"]').click();
            await page.waitForFunction(() => window.__reservationQa.calls.some(c => c.kind === 'insert'
                && c.table === 'court_unit_inventory' && c.payload.label === 'Court 11'));
            assert.equal(await page.locator('[data-admin-court-quantity]').inputValue(), '11',
                'adding a unit should sync the listing quantity before a later save');
            assert.equal(await page.locator('[data-admin-photo-slot]').count(), 12,
                'adding a second unit should add its photo slot without losing the cover');
            assert.equal(await page.locator('[data-admin-unit-label]').inputValue(), 'Court 12',
                'the suggested unit label should advance after reload');
            await page.setViewportSize({ width: 320, height: 780 });
            const unitCardWidth = await row.evaluate(el => el.getBoundingClientRect().width);
            assert(unitCardWidth > 0 && unitCardWidth <= 320, 'unit editor should fit a narrow viewport');
            assert.deepEqual(errors, [], 'owner unit rates/shared availability: browser errors');
            await context.close();
        }

        console.log('PASS reservation QA UI: owner sport-scoped unit rates/shared availability, customer multi-item dates/courts, shared-resource overlap guard, partial-save retry, occupancy, wildcard, cross-midnight, customer/staff pricing and saves, schedule, payment, API errors, 23P01, failed inventory loads, stale responses, 320–1440px layout');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
