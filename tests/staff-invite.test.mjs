import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStaffInvite } from '../supabase/functions/invite-staff/_shared/validate-staff.ts';
const valid = { email: 'staff@example.test', full_name: 'Court Staff', position: 'Court Attendant', birthdate: '1998-06-12', role: 'staff' };
test('staff invite accepts only the two positions and persists birthdate', () => {
  for (const position of ['Court Attendant', 'Secretary']) assert.equal(validateStaffInvite({ ...valid, position }, '2026-09-26').birthdate, valid.birthdate);
});
test('staff invite rejects elevated roles, unknown positions and invalid birthdates before sending email', () => {
  for (const patch of [{ role: 'admin' }, { position: 'Weekend Relief Staff' }, { birthdate: '' }, { birthdate: '2027-01-01' }, { birthdate: '2000-02-30' }]) assert.throws(() => validateStaffInvite({ ...valid, ...patch }, '2026-09-26'));
});
