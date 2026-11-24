// AHMS REST API: JWT login, role-based access control, audit log.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { calculateNews2 } = require('./clinical');
const { validateSchedule, generateSlots, weekdayOf } = require('./schedule');
const { REASONS, findReason, matchLevel } = require('./matching');
const { CATEGORIES, UNITS, bedDays, matchFees, findMissing, missingByPatient } = require('./billing');

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('Set a JWT_SECRET of at least 32 characters in production.');
}
const SECRET = process.env.JWT_SECRET || 'local-development-only-secret';
const PORT = process.env.PORT || 3000;
const app = express();
app.disable('x-powered-by');
if (process.env.FRONTEND_ORIGIN) app.use(cors({origin:process.env.FRONTEND_ORIGIN}));
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  if(req.secure || req.headers['x-forwarded-proto']==='https') res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({limit:'1mb'}));
app.get('/admin', (req,res,next) => {
  res.setHeader('Cache-Control','no-store');
  res.sendFile(path.join(__dirname, '..', 'admin.html'), error => { if(error) next(error); });
});
app.get('/admin/', (req,res) => res.redirect(302,'/admin'));
app.get('/admin.html', (req,res) => res.redirect(302,'/admin'));
app.use(express.static(path.join(__dirname, '..'))); // serves the front end from the same server

const today = () => new Date().toISOString().slice(0, 10);
const audit = (req, action, detail = '') =>
  db.result(db.client.from('audit_log').insert({user_id:req.user ? req.user.id : null,action,detail}));
const rows = query => db.result(query);
const one = query => db.result(query.maybeSingle());
/* ---- Billing helpers: charges are added to the patient's open itemised invoice ---- */
const addCharge = (req, patientId, feeId, {quantity=1, date=today(), source='manual', note=null}={}) =>
  rows(db.client.rpc('app_add_charge',{p_patient_id:patientId,p_fee_id:feeId,p_quantity:quantity,p_visit_date:date,p_source:source,p_note:note,p_user_id:req.user.id}));
// Charges the fees for a clinical event. Never blocks the clinical action; gaps show up in the missing-fees check.
async function autoCharge(req, patientId, {category, name, compulsory=false, quantity=1, date, source}) {
  try {
    const when=date||today();
    const active=await rows(db.client.from('fee_schedule').select('*').eq('active',true).eq('category',category));
    const fees=matchFees(active,{category,name,compulsory}).filter(fee=>fee.effective_from<=when);
    if(!fees.length) {
      if(name) await audit(req,'charge_unpriced',`${category}: ${name} (patient ${patientId})`);
      return {charged:0,unpriced:Boolean(name)};
    }
    let charged=0;
    for(const fee of fees) if(await addCharge(req,patientId,fee.id,{quantity,date:when,source})) charged++;
    return {charged,unpriced:false};
  } catch(error) {
    console.error('Automatic charge failed:',error.message);
    return {charged:0,error:true};
  }
}
async function billingGaps() {
  const [patients,lines,appointments,fees]=await Promise.all([
    rows(db.client.from('patients').select('id,mrn,name,created_at')),
    rows(db.client.from('invoice_lines').select('patient_id,fee_id,visit_date')),
    rows(db.client.from('appointments').select('patient_id,date,status').in('status',['Checked in','Completed'])),
    rows(db.client.from('fee_schedule').select('*').eq('active',true).eq('compulsory',true))
  ]);
  const missing=findMissing({patients,lines,appointments,fees});
  return {missing,byPatient:missingByPatient(missing),patients};
}
const validDob = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today()) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0,10) === value;
};
const ageFromDob = value => {
  const birth = new Date(`${value}T00:00:00.000Z`);
  const now = new Date();
  return now.getUTCFullYear() - birth.getUTCFullYear() -
    (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate()) ? 1 : 0);
};
const parse = p => ({
  ...p,
  age: p.date_of_birth ? ageFromDob(p.date_of_birth) : p.age,
  allergies: Array.isArray(p.allergies) ? p.allergies : JSON.parse(p.allergies),
  conditions: Array.isArray(p.conditions) ? p.conditions : JSON.parse(p.conditions)
});
const appointmentOptions = async () => {
  const doctorAccounts=await rows(db.client.from('users').select('id,name,specialty').eq('role','Doctor').eq('active',true));
  return {doctors:doctorAccounts.filter(account=>account.name&&account.specialty).map(({id,name,specialty})=>({id,name,specialty}))};
};
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const asyncRoute = handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next);

/* ---- Auth (module 7.1) ---- */
async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, SECRET); }
  catch { return fail(res, 401, 'Please sign in to continue.'); }
  try {
    if(!req.user.sid) return fail(res,401,'Your session has expired. Please sign in again.');
    const session=await one(db.client.from('app_sessions').select('last_seen_at').eq('id',req.user.sid).eq('user_id',req.user.id));
    if(!session || Date.now()-new Date(session.last_seen_at).getTime()>10*60*1000){
      await db.client.from('app_sessions').delete().eq('id',req.user.sid);
      return fail(res,401,'Your session expired after 10 minutes of inactivity. Please sign in again.');
    }
    const account = await one(db.client.from('users').select('active').eq('id',req.user.id));
    if (!account || !account.active) return fail(res, 401, 'This account is inactive. Please contact the hospital administrator.');
    await rows(db.client.from('app_sessions').update({last_seen_at:new Date().toISOString()}).eq('id',req.user.sid));
    next();
  } catch(error){ next(error); }
}
const only = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : fail(res, 403, 'Your role cannot do this.');
const doctorHasPatientAppointment = async (doctor, patientId) =>
  (await rows(db.client.from('appointments').select('id').eq('doctor',doctor).eq('patient_id',patientId).limit(1))).length > 0;

const loginHandler = (roles, deniedMessage) => asyncRoute(async(req, res) => {
  res.setHeader('Cache-Control','no-store');
  const { email } = req.body || {};
  const credential=req.body?.pin??req.body?.password;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const u = await one(db.client.from('users').select('*').eq('email',normalizedEmail));
  if (!u || !u.active) return fail(res, 401, 'Email or PIN is incorrect.');
  if (u.locked_until && new Date(u.locked_until) > new Date())
    return fail(res, 423, 'Account locked after repeated failed attempts. Try again in 15 minutes.');
  if (typeof credential!=='string' || !bcrypt.compareSync(credential, u.password_hash)) {
    const n = u.failed_attempts + 1;
    const lock = n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
    await rows(db.client.from('users').update({failed_attempts:lock?0:n,locked_until:lock}).eq('id',u.id));
    await audit({ user: { id: u.id } }, 'login_failed', normalizedEmail);
    return fail(res, 401, 'Email or PIN is incorrect.');
  }
  await rows(db.client.from('users').update({failed_attempts:0,locked_until:null}).eq('id',u.id));
  if(!roles.includes(u.role)) return fail(res,403,deniedMessage);
  const user = { id: u.id, name: u.name, role: u.role, patient_id: u.patient_id };
  const sid=crypto.randomUUID();
  await rows(db.client.from('app_sessions').insert({id:sid,user_id:u.id}));
  await audit({ user }, 'login', normalizedEmail);
  res.json({ token: jwt.sign({...user,sid}, SECRET, { expiresIn: '12h' }), user });
});
app.post('/api/auth/login', loginHandler(['Doctor','Receptionist','Nurse','Pharmacist','Lab'],'Use the administrator portal to sign in.'));
app.post('/api/admin/auth/login', loginHandler(['Admin'],'This account is not authorized for the administrator portal.'));

app.get('/api/health', asyncRoute(async(req,res) => {
  await rows(db.client.from('users').select('id').limit(1));
  res.json({status:'ok'});
}));

app.use('/api', auth); // everything below needs a valid token
app.use('/api', (req,res,next) => {
  if(req.method!=='GET') return next();
  audit(req,'record_accessed',req.path).then(()=>next(),next);
});
app.use('/api/admin', (req,res,next) => {
  res.setHeader('Cache-Control','no-store');
  next();
}, only('Admin'));

app.get('/api/appointment-options', only('Admin','Receptionist','Nurse'), asyncRoute(async(req,res) => {
  res.json({...(await appointmentOptions()),reasons:REASONS});
}));

app.post('/api/auth/change-pin', asyncRoute(async(req,res) => {
  const { current_pin, new_pin } = req.body || {};
  if(typeof new_pin!=='string'||! /^\d{8}$/.test(new_pin)) return fail(res,400,'Your new PIN must contain exactly 8 digits.');
  const user = await one(db.client.from('users').select('password_hash').eq('id',req.user.id));
  if (!user || typeof current_pin!=='string' || !bcrypt.compareSync(current_pin,user.password_hash)) {
    return fail(res,403,'Your current PIN or initial administrator credential is incorrect.');
  }
  await rows(db.client.from('users').update({password_hash:bcrypt.hashSync(new_pin,10)}).eq('id',req.user.id));
  await audit(req,'staff_pin_changed');
  res.json({ok:true});
}));
app.post('/api/auth/logout', asyncRoute(async(req,res) => {
  await rows(db.client.from('app_sessions').delete().eq('id',req.user.sid).eq('user_id',req.user.id));
  await audit(req,'logout');
  res.json({ok:true});
}));

/* ---- Dashboard (7.8) ---- */
async function dashboardSummary(role, doctorName){
  const ownDoctorAppointments=query=>role==='Doctor'?query.eq('doctor',doctorName):query;
  const appts = await rows(ownDoctorAppointments(db.client.from('appointments').select('status').eq('date',today()).neq('status','Cancelled')));
  const count = s => appts.filter(a => s.includes(a.status)).length;
  const todayDate=new Date(`${today()}T00:00:00Z`);
  const weekStart=new Date(todayDate.getTime()-6*864e5).toISOString().slice(0,10);
  const [stockItems,invoiceRows,weekRows]=await Promise.all([
    role==='Receptionist'?Promise.resolve(null):rows(db.client.from('stock').select('qty,reorder_level,expiry')),
    role==='Doctor'?Promise.resolve(null):rows(db.client.from('invoices').select('amount').eq('paid',false)),
    rows(ownDoctorAppointments(db.client.from('appointments').select('date').gte('date',weekStart).lte('date',today()).neq('status','Cancelled').order('date')))
  ]);
  const stockAlerts=stockItems===null?null:stockItems.filter(s=>s.qty<s.reorder_level||(s.expiry&&s.expiry<new Date(todayDate.getTime()+90*864e5).toISOString().slice(0,10))).length;
  const outstanding=invoiceRows===null?null:invoiceRows.reduce((sum,invoice)=>sum+invoice.amount,0);
  const weekly=weekRows.reduce((days,appointment)=>{
    const day=days.find(item=>item.date===appointment.date);
    if(day) day.count++;
    else days.push({date:appointment.date,count:1});
    return days;
  },[]);
  return {
    patientsToday: appts.length, waiting: count(['Booked', 'Confirmed']), checkedIn: count(['Checked in']),
    stockAlerts, outstanding, weekly
  };
}
app.get('/api/dashboard', only('Doctor', 'Receptionist'), asyncRoute(async(req, res) => {
  res.json(await dashboardSummary(req.user.role,req.user.name));
}));
app.get('/api/admin/dashboard', asyncRoute(async(req, res) => {
  res.json(await dashboardSummary(req.user.role));
}));

/* ---- Patients (7.2) and EMR (7.4) ---- */
app.get('/api/patients', only('Admin', 'Doctor', 'Receptionist', 'Nurse'), asyncRoute(async(req, res) => {
  let patientQuery=db.client.from('patients').select('*').order('name');
  if(req.user.role==='Doctor'){
    const appointments=await rows(db.client.from('appointments').select('patient_id').eq('doctor',req.user.name));
    const patientIds=[...new Set(appointments.map(appointment=>appointment.patient_id))];
    if(!patientIds.length) return res.json([]);
    patientQuery=patientQuery.in('id',patientIds);
  }
  const data=await rows(patientQuery);
  const q=String(req.query.q||'').toLowerCase();
  res.json(data.filter(p=>!q||`${p.name} ${p.id} ${p.mrn||''} ${p.phone||''}`.toLowerCase().includes(q)).map(parse));
}));
app.post('/api/patients', only('Admin', 'Receptionist'), asyncRoute(async(req, res) => {
  const { date_of_birth, sex = null, phone, next_of_kin = null, allergies = [], conditions = [], duplicate_override = false } = req.body;
  const name=String(req.body.name||'').trim();
  if (name.length<2 || name.length>120 || !phone || !validDob(date_of_birth)) return fail(res, 400, 'Name, phone and a valid date of birth (YYYY-MM-DD) are required.');
  if (!Array.isArray(allergies) || allergies.length > 20 || allergies.some(allergy=>typeof allergy!=='string'||allergy.length>100)) {
    return fail(res, 400, 'Check the allergy information and try again.');
  }
  if (!Array.isArray(conditions) || conditions.some(condition=>typeof condition!=='string'||condition.length>120)) {
    return fail(res, 400, 'Check the patient condition information and try again.');
  }
  const sameDob=await rows(db.client.from('patients').select('id,mrn,name,date_of_birth').eq('date_of_birth',date_of_birth));
  const duplicates=sameDob.filter(patient=>patient.name.trim().toLowerCase()===name.toLowerCase());
  if(duplicates.length&&!duplicate_override) {
    return res.status(409).json({
      error:'A patient with the same name and date of birth may already exist. Verify identity before continuing.',
      duplicates:duplicates.map(({id,mrn,name:existingName})=>({id,mrn,name:existingName}))
    });
  }
  const id=await rows(db.client.rpc('app_create_patient',{
    p_name:name,p_date_of_birth:date_of_birth,p_age:ageFromDob(date_of_birth),p_sex:sex,p_phone:phone,
    p_next_of_kin:next_of_kin,p_allergies:allergies,p_conditions:conditions,p_user_id:req.user.id
  }));
  const patient=await one(db.client.from('patients').select('mrn').eq('id',id));
  if(duplicates.length) await audit(req,'duplicate_patient_registration_confirmed',`${patient?.mrn||id}; matching ${duplicates.map(p=>p.mrn||p.id).join(',')}`);
  const billing=await autoCharge(req,id,{category:'Registration',compulsory:true,source:'registration'});
  res.status(201).json({ id, mrn:patient?.mrn, billing });
}));
app.get('/api/patients/:id', asyncRoute(async(req, res) => {
  if(!['Admin','Doctor','Receptionist','Nurse'].includes(req.user.role)) return fail(res,403,'Your role cannot view patient records.');
  if (req.user.role === 'Doctor' && !(await doctorHasPatientAppointment(req.user.name,req.params.id))) {
    return fail(res, 403, 'You can only view patients with an appointment under your care.');
  }
  const p=await one(db.client.from('patients').select('*').eq('id',req.params.id));
  if (!p) return fail(res, 404, 'Patient not found.');
  const [visits,prescriptions] = await Promise.all([
    rows(db.client.from('consultations').select('*').eq('patient_id',p.id).order('date',{ascending:false})),
    rows(db.client.from('prescriptions').select('*').eq('patient_id',p.id).order('date',{ascending:false}))
  ]);
  res.json({...parse(p),visits,prescriptions});
}));
app.post('/api/patients/:id/consultations', only('Admin', 'Doctor'), asyncRoute(async(req, res) => {
  if(req.user.role==='Doctor' && !(await doctorHasPatientAppointment(req.user.name,req.params.id))) {
    return fail(res, 403, 'You can only update records for patients with an appointment under your care.');
  }
  const {subjective,objective,assessment,plan,icd10_code}=req.body||{};
  if (![subjective,objective,assessment,plan].every(value=>typeof value==='string'&&value.trim().length>0)) {
    return fail(res,400,'Complete all four SOAP sections.');
  }
  if(typeof icd10_code!=='string'||! /^[A-Z][0-9A-Z](?:\.?[0-9A-Z]{1,4})?$/.test(icd10_code.trim().toUpperCase())) {
    return fail(res,400,'Enter an ICD-10 code. This prototype checks its format, not clinical validity.');
  }
  await rows(db.client.from('consultations').insert({
    patient_id:req.params.id,doctor:req.user.name,date:today(),diagnosis:assessment.trim(),notes:plan.trim(),
    subjective:subjective.trim(),objective:objective.trim(),assessment:assessment.trim(),plan:plan.trim(),
    icd10_code:icd10_code.trim().toUpperCase()
  }));
  await audit(req,'soap_note_created',`${req.params.id}: ${icd10_code.trim().toUpperCase()}`);
  res.status(201).json({ ok: true });
}));

/* ---- Prototype prescribing controls ---- */
app.post('/api/patients/:id/prescriptions', only('Admin', 'Doctor'), asyncRoute(async(req, res) => {
  if(req.user.role==='Doctor' && !(await doctorHasPatientAppointment(req.user.name,req.params.id))) {
    return fail(res, 403, 'You can only update records for patients with an appointment under your care.');
  }
  const { medication_id, dose } = req.body||{};
  if (!medication_id || typeof dose!=='string'||!dose.trim()) return fail(res, 400, 'Medicine and dosage are required.');
  const [p,medication]=await Promise.all([
    one(db.client.from('patients').select('allergies').eq('id',req.params.id)),
    one(db.client.from('medication_catalog').select('*').eq('id',medication_id).eq('active',true))
  ]);
  if (!p) return fail(res, 404, 'Patient not found.');
  if(!medication) return fail(res,404,'Choose an active medication from the catalog.');
  const allergies=Array.isArray(p.allergies)?p.allergies:JSON.parse(p.allergies);
  const medText=`${medication.name} ${medication.active_ingredient}`.toLowerCase();
  const classes=(medication.drug_classes||[]).map(value=>String(value).toLowerCase());
  const allergyMatches=allergies.filter(allergy=>{
    const term=String(allergy).trim().toLowerCase();
    if(!term) return false;
    if(medText.includes(term)) return true;
    if(/penicillin|penicill(in|ins)|beta.?lactam/.test(term)) return classes.some(item=>/penicillin|beta.?lactam/.test(item));
    if(/sulfa|sulfonamide/.test(term)) return classes.some(item=>/sulfa|sulfonamide/.test(item));
    return false;
  });
  if(allergyMatches.length) return res.status(409).json({
    error:`Prescription blocked: the patient has a recorded allergy matching ${allergyMatches.join(', ')}.`,
    blocked:true
  });
  const existing=await rows(db.client.from('prescriptions').select('id,medication_id').eq('patient_id',req.params.id).eq('status','Pending'));
  const activeOrders=existing.filter(order=>order.medication_id);
  if(activeOrders.length){
    const activeMedications=await rows(db.client.from('medication_catalog').select('id,active_ingredient').in('id',activeOrders.map(order=>order.medication_id)));
    if(activeMedications.some(item=>item.active_ingredient.trim().toLowerCase()===medication.active_ingredient.trim().toLowerCase())){
      return fail(res,409,'A pending prescription for the same active ingredient already exists.');
    }
  }
  await rows(db.client.from('prescriptions').insert({
    patient_id:req.params.id,drug:medication.name,dose:dose.trim(),doctor:req.user.name,date:today(),medication_id:medication.id
  }));
  await audit(req,'prescription_created',`${req.params.id}: ${medication.name}`);
  res.status(201).json({ok:true});
}));

/* ---- Nurse triage and prototype NEWS2 observations ---- */
app.get('/api/triage/queue', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  const queue=await rows(db.client.from('triage_assessments')
    .select('*, patients(name,mrn)')
    .eq('status','Waiting').order('esi_level').order('created_at'));
  res.json(queue.map(({patients,...item})=>({...item,patient_name:patients?.name||'',mrn:patients?.mrn||''})));
}));
app.post('/api/triage', only('Admin','Nurse'), asyncRoute(async(req,res) => {
  const {patient_id,esi_level,notes=''}=req.body||{};
  const level=Number(esi_level);
  if(!patient_id||!Number.isInteger(level)||level<1||level>5) return fail(res,400,'Choose an ESI level from 1 to 5 and a patient.');
  if(typeof notes!=='string'||notes.length>2000) return fail(res,400,'Triage notes must be 2,000 characters or fewer.');
  const [assessment]=await rows(db.client.from('triage_assessments')
    .insert({patient_id,esi_level:level,notes:notes.trim(),created_by:req.user.id})
    .select('id'));
  await audit(req,'triage_assessment_created',`${assessment.id}: ESI ${level}`);
  await autoCharge(req,patient_id,{category:'Consultation',compulsory:true,source:'triage'});
  res.status(201).json({id:assessment.id});
}));
app.patch('/api/triage/:id', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  if(!['Waiting','In care','Complete'].includes(req.body.status)) return fail(res,400,'Choose a valid triage status.');
  const [updated]=await rows(db.client.from('triage_assessments').update({status:req.body.status,updated_at:new Date().toISOString()})
    .eq('id',req.params.id).select('id'));
  if(!updated) return fail(res,404,'Triage assessment not found.');
  await audit(req,'triage_status_changed',`${req.params.id}: ${req.body.status}`);
  res.json({ok:true});
}));
app.post('/api/patients/:id/vitals', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  if(req.user.role==='Doctor' && !(await doctorHasPatientAppointment(req.user.name,req.params.id))) {
    return fail(res,403,'You can only record observations for patients with an appointment under your care.');
  }
  const p=await one(db.client.from('patients').select('id').eq('id',req.params.id));
  if(!p) return fail(res,404,'Patient not found.');
  let score;
  try{score=calculateNews2(req.body||{});}
  catch(error){return fail(res,400,error.message);}
  const [observation]=await rows(db.client.from('vital_signs').insert({
    patient_id:req.params.id,respiratory_rate:Number(req.body.respiratory_rate),
    oxygen_saturation:Number(req.body.oxygen_saturation),supplemental_oxygen:!!req.body.supplemental_oxygen,
    spo2_scale:1,systolic_blood_pressure:Number(req.body.systolic_blood_pressure),
    pulse_rate:Number(req.body.pulse_rate),temperature:Number(req.body.temperature),
    consciousness:req.body.consciousness,news2_score:score.score,created_by:req.user.id
  }).select('id'));
  await audit(req,'prototype_news2_recorded',`${req.params.id}: score ${score.score}`);
  res.status(201).json({id:observation.id,...score});
}));

/* ---- Laboratory orders, results and critical-value acknowledgment ---- */
app.get('/api/lab/orders', only('Admin','Doctor','Nurse','Lab'), asyncRoute(async(req,res) => {
  const orders=await rows(db.client.from('lab_orders')
    .select('*, patients(name,mrn), lab_results(*)').order('created_at',{ascending:false}).limit(200));
  res.json(orders.map(({patients,...order})=>({...order,patient_name:patients?.name||'',mrn:patients?.mrn||''})));
}));
app.post('/api/lab/orders', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  const patient_id=String(req.body?.patient_id||'');
  const test_name=String(req.body?.test_name||'').trim();
  if(!patient_id||test_name.length<2||test_name.length>160) return fail(res,400,'Choose a patient and enter a test name.');
  if(req.user.role==='Doctor'&&!(await doctorHasPatientAppointment(req.user.name,patient_id))) {
    return fail(res,403,'You can only order tests for patients with an appointment under your care.');
  }
  const [order]=await rows(db.client.from('lab_orders').insert({patient_id,test_name,ordered_by:req.user.id}).select('id'));
  await audit(req,'lab_order_created',`${order.id}: ${test_name}`);
  await autoCharge(req,patient_id,{category:'Diagnostics',name:test_name,source:'lab'});
  res.status(201).json({id:order.id});
}));
app.post('/api/lab/orders/:id/results', only('Admin','Lab'), asyncRoute(async(req,res) => {
  const order=await one(db.client.from('lab_orders').select('id,status,test_name').eq('id',req.params.id));
  if(!order||order.status!=='Pending') return fail(res,404,'Pending lab order not found.');
  const {result_value,unit,reference_low,reference_high,critical_low,critical_high}=req.body||{};
  const value=Number(result_value), low=reference_low===''||reference_low==null?null:Number(reference_low);
  const high=reference_high===''||reference_high==null?null:Number(reference_high);
  const cLow=critical_low===''||critical_low==null?null:Number(critical_low);
  const cHigh=critical_high===''||critical_high==null?null:Number(critical_high);
  if(!Number.isFinite(value)||typeof unit!=='string'||!unit.trim()||low===null||high===null||
    !Number.isFinite(low)||!Number.isFinite(high)||low>high||
    (cLow!==null&&(!Number.isFinite(cLow)||cLow>low))||
    (cHigh!==null&&(!Number.isFinite(cHigh)||cHigh<high))) {
    return fail(res,400,'Enter a numeric result, unit, reference range, and valid optional critical limits.');
  }
  const flag=cLow!==null&&value<cLow?'Critical low':cHigh!==null&&value>cHigh?'Critical high':
    value<low?'Low':value>high?'High':'Normal';
  const [result]=await rows(db.client.from('lab_results').insert({
    order_id:order.id,result_value:value,unit:unit.trim(),reference_low:low,reference_high:high,
    critical_low:cLow,critical_high:cHigh,flag,entered_by:req.user.id
  }).select('id'));
  await rows(db.client.from('lab_orders').update({status:'Completed'}).eq('id',order.id));
  await audit(req,'lab_result_recorded',`${order.id}: ${flag}`);
  res.status(201).json({id:result.id,flag,critical:flag.startsWith('Critical')});
}));
app.get('/api/lab/critical-alerts', only('Admin','Doctor'), asyncRoute(async(req,res) => {
  const alerts=await rows(db.client.from('lab_results')
    .select('*, lab_orders(test_name,patient_id,patients(name,mrn))')
    .is('acknowledged_at',null).in('flag',['Critical low','Critical high'])
    .order('created_at',{ascending:false}));
  res.json(alerts);
}));
app.post('/api/lab/results/:id/acknowledge', only('Doctor'), asyncRoute(async(req,res) => {
  const [updated]=await rows(db.client.from('lab_results')
    .update({acknowledged_by:req.user.id,acknowledged_at:new Date().toISOString()})
    .eq('id',req.params.id).is('acknowledged_at',null).in('flag',['Critical low','Critical high']).select('id'));
  if(!updated) return fail(res,404,'Unacknowledged lab alert not found.');
  await audit(req,'critical_lab_alert_acknowledged',req.params.id);
  res.json({ok:true});
}));

/* ---- Pharmacy dispensing ---- */
app.get('/api/medications', only('Admin','Doctor','Pharmacist'), asyncRoute(async(req,res) => {
  res.json(await rows(db.client.from('medication_catalog').select('*').eq('active',true).order('name')));
}));
app.post('/api/admin/medications', asyncRoute(async(req,res) => {
  const name=String(req.body?.name||'').trim();
  const active_ingredient=String(req.body?.active_ingredient||'').trim();
  const drug_classes=req.body?.drug_classes;
  if(name.length<2||name.length>160||!active_ingredient||active_ingredient.length>160||
    !Array.isArray(drug_classes)||drug_classes.some(item=>typeof item!=='string'||item.trim().length>80)) {
    return fail(res,400,'Enter a medicine name, active ingredient, and valid drug class list.');
  }
  const [created]=await rows(db.client.from('medication_catalog').insert({
    name,active_ingredient,drug_classes:drug_classes.map(item=>item.trim()).filter(Boolean)
  }).select('id'));
  await audit(req,'medication_catalog_item_created',name);
  res.status(201).json({id:created.id});
}));
app.get('/api/pharmacy/prescriptions', only('Admin','Pharmacist'), asyncRoute(async(req,res) => {
  const prescriptions=await rows(db.client.from('prescriptions')
    .select('*, patients(name,mrn), medication_catalog(name,active_ingredient,drug_classes)')
    .eq('status','Pending').order('date'));
  res.json(prescriptions.map(({patients,...item})=>({...item,patient_name:patients?.name||'',mrn:patients?.mrn||''})));
}));
app.post('/api/pharmacy/prescriptions/:id/dispense', only('Admin','Pharmacist'), asyncRoute(async(req,res) => {
  const stock_id=Number(req.body?.stock_id), quantity=Number(req.body?.quantity);
  if(!Number.isInteger(stock_id)||stock_id<1||!Number.isInteger(quantity)||quantity<1) {
    return fail(res,400,'Choose a stock item and a whole-number quantity above zero.');
  }
  try{
    await rows(db.client.rpc('app_dispense_prescription',{
      p_prescription_id:req.params.id,p_stock_id:stock_id,p_qty:quantity,p_user_id:req.user.id
    }));
  }catch(error){
    if(['P0001','P0002','22023','23505'].includes(error.code)) return fail(res,409,error.message);
    throw error;
  }
  const [prescription,stockItem]=await Promise.all([one(db.client.from('prescriptions').select('patient_id').eq('id',req.params.id)),one(db.client.from('stock').select('item').eq('id',stock_id))]);
  if(prescription&&stockItem) await autoCharge(req,prescription.patient_id,{category:'Medicine',name:stockItem.item,quantity,source:'pharmacy'});
  await audit(req,'pharmacy_dispense_completed',req.params.id);
  res.json({ok:true});
}));

/* ---- Ward capacity and inpatient admissions ---- */
app.get('/api/wards', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  const [allWards,activeAdmissions]=await Promise.all([
    rows(db.client.from('wards').select('*').eq('active',true).order('name')),
    rows(db.client.from('admissions').select('ward_id').is('discharged_at',null))
  ]);
  res.json(allWards.map(ward=>({...ward,occupied:activeAdmissions.filter(item=>item.ward_id===ward.id).length})));
}));
app.post('/api/admin/wards', asyncRoute(async(req,res) => {
  const name=String(req.body?.name||'').trim(), capacity=Number(req.body?.capacity);
  if(name.length<2||name.length>120||!Number.isInteger(capacity)||capacity<1) return fail(res,400,'Enter a ward name and positive whole-number capacity.');
  const [ward]=await rows(db.client.from('wards').insert({name,capacity}).select('id'));
  await audit(req,'ward_created',name);
  res.status(201).json({id:ward.id});
}));
app.get('/api/admissions', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  const active=await rows(db.client.from('admissions')
    .select('*, patients(name,mrn), wards(name)').is('discharged_at',null).order('admitted_at'));
  res.json(active.map(({patients,wards,...item})=>({...item,patient_name:patients?.name||'',mrn:patients?.mrn||'',ward_name:wards?.name||''})));
}));
app.post('/api/admissions', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  const {patient_id,ward_id}=req.body||{};
  if(!patient_id||!Number.isInteger(Number(ward_id))) return fail(res,400,'Choose a patient and ward.');
  try{
    const id=await rows(db.client.rpc('app_admit_patient',{
      p_patient_id:patient_id,p_ward_id:Number(ward_id),p_user_id:req.user.id
    }));
    res.status(201).json({id});
  }catch(error){
    if(['P0001','P0002','23505'].includes(error.code)) return fail(res,409,error.message);
    throw error;
  }
}));
app.post('/api/admissions/:id/discharge', only('Admin','Doctor','Nurse'), asyncRoute(async(req,res) => {
  const notes=String(req.body?.notes||'').trim();
  const current=await one(db.client.from('admissions').select('patient_id,admitted_at,wards(name)').eq('id',req.params.id).is('discharged_at',null));
  const [admission]=await rows(db.client.from('admissions').update({
    discharged_by:req.user.id,discharged_at:new Date().toISOString(),discharge_notes:notes||null
  }).eq('id',req.params.id).is('discharged_at',null).select('id'));
  if(!admission) return fail(res,404,'Active admission not found.');
  await audit(req,'patient_discharged',req.params.id);
  if(current?.wards?.name) await autoCharge(req,current.patient_id,{category:'Bed space',name:current.wards.name,quantity:bedDays(current.admitted_at,new Date().toISOString()),source:'discharge'});
  res.json({ok:true});
}));

/* ---- Appointments (7.3) ---- */
app.get('/api/appointments', only('Admin','Doctor','Receptionist','Nurse'), asyncRoute(async(req, res) => {
  let query=db.client.from('appointments').select('*, patients(name)').order('date').order('time');
  if(req.user.role==='Doctor') query=query.eq('doctor',req.user.name);
  const appointments=await rows(query);
  res.json(appointments.map(({patients,...appointment})=>({...appointment,patient_name:patients.name})));
}));
app.post('/api/appointments', only('Admin','Receptionist','Nurse'), asyncRoute(async(req, res) => {
  const { patient_id, doctor, date, time, type, reason } = req.body;
  if (!patient_id || !doctor || !date || !time) return fail(res, 400, 'Patient, doctor, date and time are required.');
  const reasonEntry=findReason(reason);
  if (!reasonEntry) return fail(res, 400, 'Choose the reason for the visit.');
  const options=await appointmentOptions();
  const selectedDoctor=options.doctors.find(item=>item.name===doctor);
  if (!selectedDoctor) return fail(res, 400, 'Choose an active doctor account.');
  try {
    const id=await rows(db.client.rpc('app_book_appointment',{
      p_patient_id:patient_id,p_doctor:doctor,p_date:date,p_time:time,p_type:type||'Consultation',p_user_id:req.user.id
    }));
    await rows(db.client.from('appointments').update({reason:reasonEntry.label}).eq('id',id));
    if(matchLevel(reason,selectedDoctor.specialty)==='other') await audit(req,'appointment_specialty_override',`appointment ${id}: "${reasonEntry.label}" booked with ${selectedDoctor.specialty}`);
    res.status(201).json({id});
  } catch(error) {
    if(error.code==='23P01') return fail(res,409,`${doctor} is already booked at ${time}. Pick another time.`);
    if(['P0003','P0004','P0005'].includes(error.code)) return fail(res,400,error.message);
    throw error;
  }
}));
app.patch('/api/appointments/:id', only('Admin', 'Receptionist', 'Doctor', 'Nurse'), asyncRoute(async(req, res) => {
  const ok = ['Booked', 'Confirmed', 'Checked in', 'Completed', 'Missed', 'Cancelled'];
  if (!ok.includes(req.body.status)) return fail(res, 400, 'Unknown status.');
  const doctorAppointmentFilter=query=>req.user.role==='Doctor'?query.eq('doctor',req.user.name):query;
  let appointment;
  if(req.body.status==='Cancelled'){
    [appointment]=await rows(doctorAppointmentFilter(db.client.from('appointments').update({status:'Cancelled'})
      .eq('id',req.params.id).in('status',['Booked','Confirmed','Checked in'])).select('id'));
    if(!appointment){
      const current=await one(doctorAppointmentFilter(db.client.from('appointments').select('id,status').eq('id',req.params.id)));
      if(!current) return fail(res,404,'Appointment not found.');
      if(current.status==='Cancelled') return res.json({ok:true,status:'Cancelled'});
      return fail(res,409,`This appointment cannot be cancelled because its status is ${current.status}.`);
    }
  }else{
    [appointment]=await rows(doctorAppointmentFilter(db.client.from('appointments').update({status:req.body.status}).eq('id',req.params.id)).select('id'));
    if (!appointment) return fail(res,404,'Appointment not found.');
  }
  await audit(req, 'appointment_' + req.body.status, req.params.id);
  if(req.body.status==='Checked in'){
    const visit=await one(db.client.from('appointments').select('patient_id,date').eq('id',req.params.id));
    if(visit) await autoCharge(req,visit.patient_id,{category:'Consultation',compulsory:true,date:visit.date,source:'check-in'});
  }
  res.json({ ok: true, status:req.body.status });
}));
app.delete('/api/appointments/:id', only('Admin', 'Receptionist'), asyncRoute(async(req, res) => {
  const appointment=await one(db.client.from('appointments').select('id,status').eq('id',req.params.id));
  if (!appointment) return fail(res,404,'Appointment not found.');
  if (appointment.status!=='Cancelled') return fail(res,409,'Only cancelled appointments can be deleted.');
  const [deleted]=await rows(db.client.from('appointments').delete().eq('id',req.params.id).eq('status','Cancelled').select('id'));
  if (!deleted) return fail(res,409,'The appointment status changed. Refresh and try again.');
  await audit(req,'appointment_deleted',req.params.id);
  res.json({ok:true});
}));

/* ---- Doctor schedules (SRS FR-SCH-01..04) ---- */
app.get('/api/schedules', only('Admin','Doctor','Receptionist','Nurse'), asyncRoute(async(req,res) => {
  let doctorQuery=db.client.from('users').select('id,name,specialty').eq('role','Doctor').eq('active',true).order('name');
  if(req.user.role==='Doctor') doctorQuery=doctorQuery.eq('id',req.user.id);
  const doctors=await rows(doctorQuery);
  const entries=doctors.length?await rows(db.client.from('doctor_schedules').select('doctor_id,weekday,start_time,end_time,slot_minutes').in('doctor_id',doctors.map(d=>d.id)).order('weekday')):[];
  res.json(doctors.map(doctor=>{
    const days=entries.filter(entry=>entry.doctor_id===doctor.id).map(({doctor_id,...entry})=>entry);
    return {...doctor,slot_minutes:days[0]?.slot_minutes||30,days};
  }));
}));
app.get('/api/doctors/:id/slots', only('Admin','Receptionist','Nurse'), asyncRoute(async(req,res) => {
  const date=String(req.query.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res,400,'Choose a valid date.');
  if(date<today()) return res.json({date,slots:[],message:'Appointments cannot be booked in the past.'});
  const doctor=await one(db.client.from('users').select('id,name').eq('id',req.params.id).eq('role','Doctor').eq('active',true));
  if(!doctor) return fail(res,404,'Doctor not found.');
  const entry=await one(db.client.from('doctor_schedules').select('*').eq('doctor_id',doctor.id).eq('weekday',weekdayOf(date)));
  if(!entry) return res.json({date,slots:[],message:`${doctor.name} does not work on this day.`});
  const booked=await rows(db.client.from('appointments').select('time').eq('doctor',doctor.name).eq('date',date).not('status','in','(Missed,Cancelled)'));
  res.json({date,slots:generateSlots(entry,booked.map(item=>item.time))});
}));
app.put('/api/admin/doctors/:id/schedule', asyncRoute(async(req,res) => {
  let days;
  try { days=validateSchedule(req.body?.days); } catch(error) { return fail(res,400,error.message); }
  const doctor=await one(db.client.from('users').select('id').eq('id',req.params.id).eq('role','Doctor'));
  if(!doctor) return fail(res,404,'Doctor not found.');
  await rows(db.client.from('doctor_schedules').delete().eq('doctor_id',doctor.id));
  if(days.length) await rows(db.client.from('doctor_schedules').insert(days.map(day=>({...day,doctor_id:doctor.id}))));
  await audit(req,'schedule_updated','doctor '+doctor.id);
  res.json({ok:true});
}));

/* ---- Billing (7.6) ---- */
app.get('/api/invoices', asyncRoute(async(req, res) => {
  if (!['Admin','Receptionist'].includes(req.user.role)) return fail(res, 403, 'Your role cannot do this.');
  const [invoices,lines,gaps]=await Promise.all([rows(db.client.from('invoices').select('*, patients(name)')),rows(db.client.from('invoice_lines').select('*').order('id')),billingGaps()]);
  invoices.sort((a,b)=>Number(b.id.slice(4))-Number(a.id.slice(4)));
  res.json(invoices.map(({patients,...invoice})=>({...invoice,patient_name:patients.name,
    lines:lines.filter(line=>line.invoice_id===invoice.id),
    missing:invoice.paid?[]:(gaps.byPatient.get(invoice.patient_id)||[])})));
}));
app.post('/api/invoices/:id/pay', only('Admin', 'Receptionist'), asyncRoute(async(req, res) => {
  const methods=['Cash','Mobile money','Insurance','Card'];
  const method=req.body?.method||'Cash';
  if(!methods.includes(method)) return fail(res,400,'Choose Cash, Mobile money, Insurance or Card.');
  const open=await one(db.client.from('invoices').select('patient_id').eq('id',req.params.id).eq('paid',false));
  if(!open) return fail(res, 404, 'Invoice not found or already paid.');
  const owed=(await billingGaps()).byPatient.get(open.patient_id);
  if(owed?.length) return fail(res,409,`Compulsory fees are missing: ${owed.join(', ')}. Use “Charge missing fees” first, or ask an administrator to waive them.`);
  const [invoice]=await rows(db.client.from('invoices').update({paid:true,method,paid_at:new Date().toISOString()}).eq('id',req.params.id).eq('paid',false).select('id'));
  if (!invoice) return fail(res, 404, 'Invoice not found or already paid.');
  await audit(req, 'payment_recorded', req.params.id);
  res.json({ ok: true });
}));

/* ---- Fee schedule and itemised charges (SRS FR-BIL-01..12) ---- */
app.get('/api/fees', only('Admin','Receptionist'), asyncRoute(async(req,res) => {
  const [fees,stockRows,wardRows,labRows]=await Promise.all([
    rows(db.client.from('fee_schedule').select('*').order('category').order('name')),
    rows(db.client.from('stock').select('item')),
    rows(db.client.from('wards').select('name').eq('active',true)),
    rows(db.client.from('lab_orders').select('test_name'))
  ]);
  const has=(category,name)=>fees.some(fee=>fee.active&&fee.category===category&&fee.name.toLowerCase()===String(name).trim().toLowerCase());
  const unique=list=>[...new Set(list.map(item=>String(item).trim()))];
  res.json({fees,gaps:{
    medicine:unique(stockRows.map(row=>row.item)).filter(name=>!has('Medicine',name)),
    bed:unique(wardRows.map(row=>row.name)).filter(name=>!has('Bed space',name)),
    diagnostics:unique(labRows.map(row=>row.test_name)).filter(name=>!has('Diagnostics',name))
  }});
}));
app.post('/api/admin/fees', asyncRoute(async(req,res) => {
  const {category,unit,compulsory=false}=req.body||{}, name=String(req.body?.name||'').trim(), amount=Number(req.body?.amount);
  const effective=String(req.body?.effective_from||today());
  if(!CATEGORIES.includes(category)||!UNITS.includes(unit)||name.length<2||name.length>120||!Number.isInteger(amount)||amount<0||amount>100000000||!/^\d{4}-\d{2}-\d{2}$/.test(effective)) {
    return fail(res,400,'Choose a category and unit, enter a name, and a whole-number UGX amount (zero or more).');
  }
  try {
    const [fee]=await rows(db.client.from('fee_schedule').insert({category,name,amount,unit,compulsory:Boolean(compulsory),effective_from:effective}).select('id'));
    await audit(req,'fee_created',`${category}: ${name} UGX ${amount}${compulsory?' (compulsory)':''}`);
    res.status(201).json({id:fee.id});
  } catch(error) {
    if(error.code==='23505') return fail(res,409,'A fee with this name already exists in this category.');
    throw error;
  }
}));
app.patch('/api/admin/fees/:id', asyncRoute(async(req,res) => {
  const update={};
  if(req.body?.amount!==undefined){const amount=Number(req.body.amount);if(!Number.isInteger(amount)||amount<0||amount>100000000) return fail(res,400,'Amount must be a whole number of UGX.');update.amount=amount;}
  if(req.body?.active!==undefined) update.active=Boolean(req.body.active);
  if(!Object.keys(update).length) return fail(res,400,'Nothing to update.');
  const [fee]=await rows(db.client.from('fee_schedule').update(update).eq('id',req.params.id).select('id,name'));
  if(!fee) return fail(res,404,'Fee not found.');
  await audit(req,'fee_updated',`${fee.name}: ${JSON.stringify(update)}`);
  res.json({ok:true});
}));
app.post('/api/patients/:id/charges', only('Admin','Receptionist'), asyncRoute(async(req,res) => {
  const feeId=Number(req.body?.fee_id), quantity=Number(req.body?.quantity??1), note=String(req.body?.note||'').trim().slice(0,200)||null;
  if(!Number.isInteger(feeId)||!Number.isInteger(quantity)||quantity<1||quantity>1000) return fail(res,400,'Choose a fee and a whole-number quantity from 1 to 1,000.');
  const patient=await one(db.client.from('patients').select('id').eq('id',req.params.id));
  if(!patient) return fail(res,404,'Patient not found.');
  try {
    const lineId=await addCharge(req,patient.id,feeId,{quantity,source:'manual',note});
    if(!lineId) return fail(res,409,'This fee has already been charged to this patient (once-only fees, or the same fee today).');
    res.status(201).json({id:lineId});
  } catch(error) {
    if(error.code==='P0010') return fail(res,404,error.message);
    throw error;
  }
}));
app.get('/api/billing/compliance', only('Admin','Receptionist'), asyncRoute(async(req,res) => {
  const gaps=await billingGaps();
  const names=new Map(gaps.patients.map(patient=>[patient.id,patient]));
  res.json({items:[...gaps.byPatient].map(([id,missing])=>({patient_id:id,name:names.get(id)?.name||id,mrn:names.get(id)?.mrn,missing}))});
}));
app.post('/api/billing/charge-missing', only('Admin','Receptionist'), asyncRoute(async(req,res) => {
  const {missing}=await billingGaps();
  let charged=0;
  for(const item of missing.missingOnce) if(await addCharge(req,item.patient_id,item.fee_id,{source:'backfill'})) charged++;
  for(const item of missing.missingVisit) if(await addCharge(req,item.patient_id,item.fee_id,{date:item.date,source:'backfill'})) charged++;
  await audit(req,'missing_fees_charged',`${charged} charge(s)`);
  res.json({charged});
}));
app.post('/api/invoices/lines/:id/waive', only('Admin'), asyncRoute(async(req,res) => {
  const reason=String(req.body?.reason||'').trim();
  if(reason.length<5||reason.length>300) return fail(res,400,'Give a reason of at least 5 characters.');
  try {
    await rows(db.client.rpc('app_waive_line',{p_line_id:Number(req.params.id),p_reason:reason,p_user_id:req.user.id}));
  } catch(error) {
    if(error.code==='P0011') return fail(res,409,error.message);
    throw error;
  }
  res.json({ok:true});
}));

/* ---- Inventory (7.7) ---- */
app.get('/api/stock', only('Admin', 'Pharmacist'), asyncRoute(async(req, res) => {
  const data=await rows(db.client.from('stock').select('*').order('item'));
  const now=new Date(), todayDate=now.toISOString().slice(0,10);
  const nearExpiryDate=new Date(now.getTime()+90*864e5).toISOString().slice(0,10);
  res.json(data.map(s=>{
    const alerts=[];
    if(s.expiry&&s.expiry<todayDate) alerts.push('Expired');
    else if(s.expiry&&s.expiry<=nearExpiryDate) alerts.push('Near expiry');
    if(s.qty<s.reorder_level) alerts.push('Low stock');
    return {...s,status:alerts[0]||'OK',alerts};
  }));
}));
app.post('/api/admin/stock/:id/restock', asyncRoute(async(req, res) => {
  const qty = parseInt(req.body.qty, 10);
  if (!(qty > 0)) return fail(res, 400, 'Enter a quantity above zero.');
  const updated=await rows(db.client.rpc('app_restock_stock',{p_stock_id:req.params.id,p_qty:qty,p_user_id:req.user.id}));
  if (!updated) return fail(res,404,'Stock item not found.');
  res.json({ ok: true });
}));

/* ---- Administration (7.10) ---- */
app.get('/api/admin/specialities', asyncRoute(async(req, res) => {
  const rowsFromDb=await rows(db.client.from('specialities').select('specialist_title').order('specialist_title'));
  res.json([...new Set(rowsFromDb
    .map(({specialist_title})=>String(specialist_title||'').trim())
    .filter(Boolean))]);
}));
app.get('/api/admin/users', asyncRoute(async(req, res) => {
  const users=await rows(db.client.from('users').select('id,name,email,role,specialty,active').order('id'));
  res.json(users);
}));
app.post('/api/admin/users', asyncRoute(async(req, res) => {
  const { name, role } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  const specialty = role === 'Doctor' ? String(req.body.specialty || '').trim() : null;
  if (typeof name!=='string' || name.trim().length<2 || name.trim().length>120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(res, 400, 'Enter a name and a valid email address.');
  }
  if (!['Admin','Doctor','Receptionist','Nurse','Pharmacist','Lab'].includes(role)) return fail(res, 400, 'Choose a valid staff role.');
  if (role === 'Doctor' && (!specialty || specialty.length > 120 ||
      !(await one(db.client.from('specialities').select('id').eq('specialist_title',specialty))))) {
    return fail(res, 400, "Choose a specialist title from the Specialities table.");
  }
  const pin=String(crypto.randomInt(10000000,100000000));
  try {
    const [created]=await rows(db.client.from('users').insert({
      name:name.trim(),email,password_hash:bcrypt.hashSync(pin,10),role,specialty
    }).select('id'));
    if(role==='Doctor') await rows(db.client.from('doctor_schedules').insert([1,2,3,4,5].map(weekday=>({doctor_id:created.id,weekday,start_time:'08:00',end_time:'17:00',slot_minutes:30}))));
    await audit(req, 'user_created', email);
    await audit({...req,user:{id:created.id}},'staff_pin_issued',email);
    res.status(201).json({ ok: true, pin });
  } catch(error) {
    if(error.code==='23505') return fail(res,400,'That email is already in use.');
    throw error;
  }
}));
app.post('/api/admin/users/:id/reset-pin', asyncRoute(async(req,res) => {
  const pin=String(crypto.randomInt(10000000,100000000));
  const [account]=await rows(db.client.from('users').update({
    password_hash:bcrypt.hashSync(pin,10),failed_attempts:0,locked_until:null
  }).eq('id',req.params.id).select('id,email'));
  if(!account) return fail(res,404,'User account not found.');
  await audit(req,'staff_pin_reset',account.email);
  res.json({ok:true,pin});
}));
app.patch('/api/admin/users/:id', asyncRoute(async(req, res) => {
  const active = Boolean(req.body.active);
  const [account]=await rows(db.client.from('users').update({active}).eq('id',req.params.id).select('id'));
  if (!account) return fail(res,404,'User account not found.');
  await audit(req, active ? 'user_activated' : 'user_deactivated', req.params.id);
  res.json({ ok: true });
}));
app.get('/api/admin/audit', asyncRoute(async(req, res) => {
  const entries=await rows(db.client.from('audit_log').select('*, users(name)').order('id',{ascending:false}).limit(100));
  res.json(entries.map(({users,...entry})=>({...entry,user:users?.name||null})));
}));

app.use((err, req, res, next) => { console.error(err); fail(res, 500, 'Something went wrong on the server.'); });

async function start(){
  try{
    await db.initialize();
    const server = app.listen(PORT, () => console.log(`AHMS running at http://localhost:${PORT}`));
    const shutdown = () => server.close();
    process.once('SIGTERM',shutdown);
    process.once('SIGINT',shutdown);
  }catch(error){
    console.error('Unable to start AHMS:',error.message);
    process.exitCode=1;
  }
}

start();
