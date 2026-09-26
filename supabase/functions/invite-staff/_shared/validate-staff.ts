export function validateStaffInvite(payload: Record<string, unknown>, today: string) {
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const fullName = typeof payload.full_name === 'string' ? payload.full_name.trim() : '';
  const position = payload.position;
  const birthdate = typeof payload.birthdate === 'string' ? payload.birthdate : '';
  const parsed = new Date(`${birthdate}T00:00:00Z`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || fullName.length > 160) throw new Error('Enter a valid email address and full name.');
  if (position !== 'Secretary' && position !== 'Court Attendant') throw new Error('Choose Secretary or Court Attendant.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthdate || birthdate > today || birthdate < '1900-01-01') throw new Error('Enter a valid birthdate that is not in the future.');
  if (payload.role && payload.role !== 'staff') throw new Error('This invitation creates staff accounts only.');
  const text = (key: string, max = 500) => typeof payload[key] === 'string' ? (payload[key] as string).trim().slice(0, max) : '';
  const emergencyNumber = text('emergency_contact_number', 30);
  if (emergencyNumber && !/^(?:\+63|0)9\d{9}$/.test(emergencyNumber)) throw new Error('Enter a valid Philippine emergency contact number.');
  return { email, full_name: fullName, position, birthdate, role: 'staff', address: text('address'), gender: text('gender', 30), emergency_contact_name: text('emergency_contact_name', 160), emergency_contact_number: emergencyNumber };
}
