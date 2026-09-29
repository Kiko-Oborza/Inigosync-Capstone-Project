import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const migrations = [
  '20260928020000_staff_activity_announcements_notifications.sql',
  '20260929020000_guard_profile_role_changes.sql',
];

for (const migration of migrations) {
  test(`${migration} prevents browser accounts from changing profile roles`, () => {
    const sql = readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8');
    assert.match(sql, /create or replace function internal\.guard_profile_status_change\(\)/i);
    assert.match(sql, /new\.role is distinct from old\.role\s+and \(select auth\.role\(\)\) is distinct from 'service_role'/i);
    assert.match(sql, /raise exception 'Account role cannot be changed directly' using errcode='42501'/i);
  });
}
