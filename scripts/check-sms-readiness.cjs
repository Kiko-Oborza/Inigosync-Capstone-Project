// Read-only preflight. Uses only the project's public key; never sends an SMS.
const fs = require('node:fs');
const path = require('node:path');

(async () => {
    const source = fs.readFileSync(path.join(__dirname, '../Config/supabaseClient.js'), 'utf8');
    const url = source.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
    const key = source.match(/const SUPABASE_PUBLISHABLE_KEY = '([^']+)'/)?.[1];
    if (!url || !key) throw new Error('Could not read the public Supabase configuration.');
    const response = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key }, signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Auth settings request failed (HTTP ${response.status}).`);
    const settings = await response.json();
    const enabled = settings.external?.phone === true;
    const confirmations = settings.sms_autoconfirm === false;
    console.log(`Phone provider: ${enabled ? 'enabled' : 'disabled'}`);
    console.log(`SMS confirmation required: ${confirmations ? 'yes' : settings.sms_autoconfirm === true ? 'NO' : 'unknown; inspect dashboard'}`);
    console.log('Provider credentials, balance and delivery cannot be verified through public settings.');
    if (!enabled || settings.sms_autoconfirm === true) {
        console.log('NOT READY: follow docs/sms-provider-setup.md before a real SMS test.');
        process.exitCode = 2;
    } else {
        console.log('Public configuration preflight passed. Confirm OTP requirements in the dashboard when not exposed above. A real SMS receipt and code confirmation are still required.');
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
