import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPaymongoPaidWebhook } from '../supabase/functions/_shared/paymongo-readiness.mjs';

const target = 'https://project.supabase.co/functions/v1/paymongo-webhook';
const entry = (overrides = {}) => ({ attributes: {
    url: target, status: 'enabled', livemode: false,
    events: ['checkout_session.payment.paid'], ...overrides,
} });
const configured = (entries = [entry()], responseOk = true) => ({
    secretKey: 'sk_test_placeholder', webhookSecret: 'whsec_placeholder',
    supabaseUrl: 'https://project.supabase.co',
    fetcher: async () => ({ ok: responseOk, json: async () => ({ data: entries }) }),
});

test('accepts only an enabled paid-event webhook for the same project and mode', async () => {
    assert.equal(await hasPaymongoPaidWebhook(configured()), true);
    for (const mismatch of [
        { url: 'https://other.supabase.co/functions/v1/paymongo-webhook' },
        { status: 'disabled' },
        { livemode: true },
        { events: ['payment.paid'] },
    ]) assert.equal(await hasPaymongoPaidWebhook(configured([entry(mismatch)])), false);
});

test('refuses a new checkout if the webhook secret or provider check is unavailable', async () => {
    let called = false;
    const missing = configured();
    missing.webhookSecret = '';
    missing.fetcher = async () => { called = true; throw Error('must not fetch'); };
    assert.equal(await hasPaymongoPaidWebhook(missing), false);
    assert.equal(called, false);
    assert.equal(await hasPaymongoPaidWebhook(configured([], false)), false);
    assert.equal(await hasPaymongoPaidWebhook({ ...configured(), fetcher: async () => { throw Error('offline'); } }), false);
    assert.equal(await hasPaymongoPaidWebhook({ ...configured(), secretKey: 'bad_key' }), false);
});

test('matches live-mode webhook only when a live key is configured', async () => {
    assert.equal(await hasPaymongoPaidWebhook({ ...configured([entry({ livemode: true })]),
        secretKey: 'sk_live_placeholder' }), true);
});
