require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the backend environment.');
}

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function seedDatabase() {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (Boolean(adminEmail) !== Boolean(adminPassword)) {
    throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither.');
  }

  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
    const existingAdmin = await result(client.from('users').select('role').eq('email', adminEmail).maybeSingle());
    if (existingAdmin && existingAdmin.role !== 'Admin') {
      throw new Error('ADMIN_EMAIL is already assigned to a non-admin account.');
    }
    if (!existingAdmin) {
      await result(client.from('users').insert({
        name: 'Hospital Administrator', email: adminEmail,
        password_hash: bcrypt.hashSync(adminPassword, 10), role: 'Admin'
      }));
      console.log('Initial administrator account created.');
    }
    return;
  }

  const { count } = await client.from('users').select('id', { count: 'exact', head: true });
  if (count === null) throw new Error('Could not check Supabase users. Verify the schema and service role key.');
  if (count !== 0) return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before starting with an empty Supabase database.');
  }

  const patients = [
    { id: 'P-001', name: 'Grace Nakato', age: 34, sex: 'F', phone: '0772 100 201', next_of_kin: 'John Nakato', allergies: ['Penicillin'], conditions: ['Asthma'] },
    { id: 'P-002', name: 'Moses Kiwanuka', age: 58, sex: 'M', phone: '0701 455 118', next_of_kin: 'Sarah Kiwanuka', allergies: [], conditions: ['Hypertension', 'Type 2 diabetes'] },
    { id: 'P-003', name: 'Esther Namusoke', age: 27, sex: 'F', phone: '0755 812 640', next_of_kin: 'Ruth Namusoke', allergies: ['Sulfa drugs', 'Latex'], conditions: [] },
    { id: 'P-004', name: 'Daniel Opio', age: 8, sex: 'M', phone: '0782 990 337', next_of_kin: 'Peter Opio', allergies: [], conditions: [] }
  ];
  const users = [
    { name: 'Admin User', email: 'admin@acms.local', password_hash: bcrypt.hashSync('10000001', 10), role: 'Admin' },
    { name: 'Dr. Okello', email: 'okello@acms.local', password_hash: bcrypt.hashSync('10000002', 10), role: 'Doctor', specialty: 'General Practice' },
    { name: 'Rita Auma', email: 'rita@acms.local', password_hash: bcrypt.hashSync('10000003', 10), role: 'Receptionist' }
  ];
  const date = new Date().toISOString().slice(0, 10);
  const appointments=[
    { patient_id: 'P-002', doctor: 'Dr. Achieng', date, time: '08:30', type: 'Follow-up', status: 'Completed' },
    { patient_id: 'P-001', doctor: 'Dr. Okello', date, time: '09:15', type: 'Consultation', status: 'Checked in' },
    { patient_id: 'P-004', doctor: 'Dr. Achieng', date, time: '10:00', type: 'Review', status: 'Confirmed' },
    { patient_id: 'P-003', doctor: 'Dr. Okello', date, time: '11:30', type: 'New patient', status: 'Booked' }
  ];
  const consultations=[{
    patient_id: 'P-001', doctor: 'Dr. Okello', date: '2026-09-12', diagnosis: 'Acute bronchitis', notes: 'Cough for 5 days, wheeze on exam.'
  }];
  const prescriptions=[{
    patient_id: 'P-001', drug: 'Salbutamol inhaler', dose: '2 puffs as needed', doctor: 'Dr. Okello', date: '2026-09-12'
  }];
  const invoices=[
    { id: 'INV-1042', patient_id: 'P-001', items: 'Consultation, Salbutamol', amount: 65000, paid: true },
    { id: 'INV-1043', patient_id: 'P-002', items: 'Consultation, Amlodipine, Metformin', amount: 88000, paid: false },
    { id: 'INV-1044', patient_id: 'P-004', items: 'Consultation, Malaria test, ALu', amount: 72000, paid: false }
  ];
  const stock=[
    { item: 'Amoxicillin 500mg', qty: 420, reorder_level: 150, expiry: '2027-03-01', supplier: 'MediPlus Ltd' },
    { item: 'Artemether-lumefantrine', qty: 38, reorder_level: 80, expiry: '2027-01-15', supplier: 'PharmaCare' },
    { item: 'Metformin 500mg', qty: 260, reorder_level: 100, expiry: '2026-11-05', supplier: 'MediPlus Ltd' },
    { item: 'Salbutamol inhaler', qty: 24, reorder_level: 30, expiry: '2027-06-20', supplier: 'PharmaCare' },
    { item: 'Paracetamol 500mg', qty: 900, reorder_level: 300, expiry: '2028-02-11', supplier: 'Kampala Meds' }
  ];
  await result(client.rpc('app_seed_demo_data',{p_data:{patients,users,appointments,consultations,prescriptions,invoices,stock}}));
  const seededDoctors = await result(client.from('users').select('id').eq('role', 'Doctor'));
  if (seededDoctors.length) {
    await result(client.from('doctor_schedules').upsert(seededDoctors.flatMap(({ id }) => [1, 2, 3, 4, 5].map(weekday =>
      ({ doctor_id: id, weekday, start_time: '08:00', end_time: '17:00', slot_minutes: 30 }))), { onConflict: 'doctor_id,weekday' }));
  }
  console.log('Development demo data seeded.');
}

async function initialize({ seed = true } = {}) {
  const { error } = await client.from('users').select('id').limit(1);
  if (error) {
    throw new Error(`Could not connect to Supabase: ${error.message}. Apply backend/schema.sql in the Supabase SQL Editor and check the project URL and service role key.`);
  }
  if (seed) await seedDatabase();
}

module.exports = { client, result, initialize };
