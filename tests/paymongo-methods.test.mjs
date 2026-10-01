import test from 'node:test';
import assert from 'node:assert/strict';
import { enabledPaymongoMethods } from '../supabase/functions/_shared/paymongo-methods.mjs';

test('uses only the online methods explicitly enabled by the owner', () => {
    assert.deepEqual(enabledPaymongoMethods({ card_enabled: true, gcash_enabled: true }), ['card', 'gcash']);
    assert.deepEqual(enabledPaymongoMethods({ card_enabled: true, gcash_enabled: false }), ['card']);
    assert.deepEqual(enabledPaymongoMethods({ card_enabled: false, gcash_enabled: true }), ['gcash']);
});

test('missing, incomplete, or disabled settings do not enable checkout', () => {
    assert.deepEqual(enabledPaymongoMethods(null), []);
    assert.deepEqual(enabledPaymongoMethods({}), []);
    assert.deepEqual(enabledPaymongoMethods({ card_enabled: false, gcash_enabled: false }), []);
    assert.deepEqual(enabledPaymongoMethods({ card_enabled: 'true', gcash_enabled: null }), []);
});
