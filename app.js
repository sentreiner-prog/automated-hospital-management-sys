/* AHMS role-based hospital workspace. */
const $ = s => document.querySelector(s);
const UGX = n => 'UGX ' + n.toLocaleString('en-US');
const esc = value => String(value??'').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const ico = {
  home:'<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  users:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  bill:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
  box:'<path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-9 9-4.5-1-8-4-8-9V6z"/>',
  health:'<path d="M3 12h4l3-8 4 16 3-8h4"/>'
};
/* Role-based access control (module 7.1) */
const NAV = [
  {id:'dashboard', label:'Dashboard',    icon:'home',  roles:['Admin','Doctor','Receptionist']},
  {id:'patients',  label:'Patients',     icon:'users', roles:['Admin','Doctor','Receptionist','Nurse']},
  {id:'appts',     label:'Appointments', icon:'cal',   roles:['Admin','Doctor','Receptionist','Nurse']},
  {id:'schedules', label:'Doctor schedules',icon:'cal',roles:['Admin','Doctor','Receptionist','Nurse']},
  {id:'triage',    label:'Triage queue',  icon:'health',roles:['Admin','Doctor','Nurse']},
  {id:'billing',   label:'Billing',      icon:'bill',  roles:['Admin','Receptionist']},
  {id:'fees',      label:'Fee schedule', icon:'bill',  roles:['Admin','Receptionist']},
  {id:'pharmacy',  label:'Pharmacy',      icon:'box',  roles:['Admin','Pharmacist']},
  {id:'stock',     label:'Pharmacy stock',icon:'box',  roles:['Admin','Pharmacist']},
  {id:'lab',       label:'Laboratory',    icon:'health',roles:['Admin','Doctor','Nurse','Lab']},
  {id:'wards',     label:'Admissions',    icon:'users', roles:['Admin','Doctor','Nurse']},
  {id:'medications',label:'Medication catalog',icon:'box',roles:['Admin','Doctor','Pharmacist']},
  {id:'admin',     label:'Administration',icon:'shield',roles:['Admin']},
];
/* Demo data */
const patients = [
 {id:'P-001',name:'Grace Nakato',age:34,sex:'F',phone:'0772 100 201',kin:'John Nakato',allergies:['Penicillin'],cond:['Asthma'],
  visits:[{d:'2026-09-12',doc:'Dr. Okello',dx:'Acute bronchitis',n:'Cough for 5 days, wheeze on exam. Salbutamol prescribed.'},{d:'2026-05-03',doc:'Dr. Okello',dx:'Routine review',n:'Asthma well controlled. BP 118/76.'}],
  rx:[{drug:'Salbutamol inhaler',dose:'2 puffs as needed',d:'2026-09-12'}]},
 {id:'P-002',name:'Moses Kiwanuka',age:58,sex:'M',phone:'0701 455 118',kin:'Sarah Kiwanuka',allergies:[],cond:['Hypertension','Type 2 diabetes'],
  visits:[{d:'2026-09-20',doc:'Dr. Achieng',dx:'Hypertension follow-up',n:'BP 148/92. Amlodipine dose reviewed.'}],
  rx:[{drug:'Amlodipine 5mg',dose:'1 tablet daily',d:'2026-09-20'},{drug:'Metformin 500mg',dose:'1 tablet twice daily',d:'2026-09-20'}]},
 {id:'P-003',name:'Esther Namusoke',age:27,sex:'F',phone:'0755 812 640',kin:'Ruth Namusoke',allergies:['Sulfa drugs','Latex'],cond:[],visits:[],rx:[]},
 {id:'P-004',name:'Daniel Opio',age:8,sex:'M',phone:'0782 990 337',kin:'Peter Opio',allergies:[],cond:[],
  visits:[{d:'2026-09-25',doc:'Dr. Achieng',dx:'Malaria (uncomplicated)',n:'RDT positive. Artemether-lumefantrine started.'}],
  rx:[{drug:'Artemether-lumefantrine',dose:'Per weight, 3 days',d:'2026-09-25'}]}
];
const appts = [
 {id:1,pid:'P-002',doc:'Dr. Achieng',time:'08:30',type:'Follow-up',status:'Completed'},
 {id:2,pid:'P-001',doc:'Dr. Okello',time:'09:15',type:'Consultation',status:'Checked in'},
 {id:3,pid:'P-004',doc:'Dr. Achieng',time:'10:00',type:'Review',status:'Confirmed'},
 {id:4,pid:'P-003',doc:'Dr. Okello',time:'11:30',type:'New patient',status:'Booked'},
 {id:5,pid:'P-002',doc:'Dr. Okello',time:'14:00',type:'Lab review',status:'Missed'}
];
const invoices = [
 {id:'INV-1042',pid:'P-001',items:'Consultation, Salbutamol',amt:65000,paid:true},
 {id:'INV-1043',pid:'P-002',items:'Consultation, Amlodipine, Metformin',amt:88000,paid:false},
 {id:'INV-1044',pid:'P-004',items:'Consultation, Malaria test, ALu',amt:72000,paid:false}
];
const triageQueue = [];
const labOrders = [];
const criticalLabs = [];
const wards = [];
const admissions = [];
const pharmacyOrders = [];
const medications = [];
const stock = [
 {item:'Amoxicillin 500mg',qty:420,reorder:150,exp:'2027-03-01',sup:'MediPlus Ltd'},
 {item:'Artemether-lumefantrine',qty:38,reorder:80,exp:'2027-01-15',sup:'PharmaCare'},
 {item:'Metformin 500mg',qty:260,reorder:100,exp:'2026-11-05',sup:'MediPlus Ltd'},
 {item:'Salbutamol inhaler',qty:24,reorder:30,exp:'2027-06-20',sup:'PharmaCare'},
 {item:'Paracetamol 500mg',qty:900,reorder:300,exp:'2028-02-11',sup:'Kampala Meds'}
];
const users = [
 {name:'Admin User',role:'Admin',active:true},{name:'Dr. Okello',role:'Doctor',active:true},
 {name:'Dr. Achieng',role:'Doctor',active:true},{name:'Rita Auma',role:'Receptionist',active:true},
 {name:'Paul Mugisha',role:'Receptionist',active:false}
];
const adminPortal = document.body.dataset.portal==='admin' || location.pathname==='/admin' || location.pathname==='/admin/';
const state = {role:null, view:'dashboard', q:'', open:null, tab:'overview', token:sessionStorage.getItem('acms-token'), user:null};
let idleTimeout;
const pat = id => patients.find(p => p.id === id);
const pill = (t, c) => `<span class="pill p-${c}">${t}</span>`;
const stColor = {Booked:'blue',Confirmed:'blue','Checked in':'green',Completed:'grey',Missed:'red'};
const stockState = s => s.status ? [s.status,['Low stock','Expired'].includes(s.status)?'red':s.status==='Near expiry'?'amber':'green'] : (s.qty < s.reorder ? ['Low stock','red'] : (new Date(s.exp) - new Date() < 90*864e5 ? ['Near expiry','amber'] : ['OK','green']));
const allowed = () => NAV.filter(n => n.roles.includes(state.role));
function resetIdleTimeout(){
  clearTimeout(idleTimeout);
  if(state.token) idleTimeout=setTimeout(()=>{
    signOut();
    $('#login-error').textContent='Signed out after 10 minutes of inactivity.';
  },10*60*1000);
}

async function api(url, options={}){
  const headers = {'Content-Type':'application/json', ...(options.headers||{})};
  if(state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, {...options, headers});
  if(!response.headers.get('content-type')?.includes('application/json')){
    throw new Error('The hospital API returned an unexpected response. Open AHMS through its backend server, not a static preview server.');
  }
  const body = await response.json();
  if(!response.ok){
    if(response.status===401 && state.token) signOut();
    throw Object.assign(new Error(body.error || 'The request could not be completed.'), {status:response.status, body});
  }
  return body;
}

async function appointmentOptions(){
  return api('/api/appointment-options');
}

const schedules = [], fees = [], compliance = {items:[]};
let feeGaps = {medicine:[],bed:[],diagnostics:[]};
const replace = (target, rows) => target.splice(0, target.length, ...rows);
async function refreshData(){
  const roles={
    appointments:['Admin','Doctor','Receptionist','Nurse'],
    patients:['Admin','Doctor','Receptionist','Nurse'],
    invoices:['Admin','Receptionist'],
    stock:['Admin','Pharmacist'],
    schedules:['Admin','Doctor','Receptionist','Nurse'],
    triageQueue:['Admin','Doctor','Nurse'],
    labOrders:['Admin','Doctor','Nurse','Lab'],
    criticalLabs:['Admin','Doctor'],
    wards:['Admin','Doctor','Nurse'],
    admissions:['Admin','Doctor','Nurse'],
    pharmacyOrders:['Admin','Pharmacist'],
    medications:['Admin','Doctor','Pharmacist']
  };
  const routes={
    appointments:'/api/appointments',patients:'/api/patients',invoices:'/api/invoices',stock:'/api/stock',
    schedules:'/api/schedules',triageQueue:'/api/triage/queue',labOrders:'/api/lab/orders',criticalLabs:'/api/lab/critical-alerts',
    wards:'/api/wards',admissions:'/api/admissions',pharmacyOrders:'/api/pharmacy/prescriptions',medications:'/api/medications'
  };
  const requests=Object.fromEntries(Object.entries(roles)
    .filter(([,allowedRoles])=>allowedRoles.includes(state.role))
    .map(([key])=>[key,api(routes[key])]));
  if(state.role==='Admin'){
    requests.users=api('/api/admin/users');
    requests.audit=api('/api/admin/audit');
  }
  if(['Admin','Receptionist'].includes(state.role)){
    requests.fees=api('/api/fees');
    requests.compliance=api('/api/billing/compliance');
  }
  if(['Admin','Doctor','Receptionist'].includes(state.role)){
    requests.dashboard=api(state.role==='Admin'?'/api/admin/dashboard':'/api/dashboard');
  }
  const data=Object.fromEntries(await Promise.all(Object.entries(requests).map(async([key,promise])=>[key,await promise])));
  if(data.appointments) replace(appts,data.appointments.map(a=>({...a,pid:a.patient_id,doc:a.doctor})));
  if(data.patients) replace(patients,data.patients.map(p=>({
    ...p,kin:p.next_of_kin||'',cond:p.conditions||[],
    visits:(p.visits||[]).map(v=>({...v,d:v.date,dx:v.assessment||v.diagnosis,n:v.plan||v.notes,doc:v.doctor})),
    rx:(p.prescriptions||[]).map(r=>({...r,d:r.date}))
  })));
  if(data.invoices) replace(invoices,data.invoices.map(r=>({...r,pid:r.patient_id,amt:r.amount,paid:!!r.paid})));
  if(data.fees){replace(fees,data.fees.fees);feeGaps=data.fees.gaps;}
  if(data.compliance) replace(compliance.items,data.compliance.items);
  if(data.stock) replace(stock,data.stock.map(s=>({...s,reorder:s.reorder_level,exp:s.expiry,sup:s.supplier})));
  for(const key of ['schedules','triageQueue','labOrders','criticalLabs','wards','admissions','pharmacyOrders','medications']){
    if(data[key]) replace(({schedules,triageQueue,labOrders,criticalLabs,wards,admissions,pharmacyOrders,medications})[key],data[key]);
  }
  if(data.users) replace(users,data.users.map(u=>({...u,active:!!u.active})));
  if(data.audit) state.audit=data.audit;
  state.dashboard=data.dashboard||null;
}

async function refreshAfterMutation(message){
  toast(message);
  try{ await refreshData(); render(); }
  catch(error){ toast(`${message}; screen refresh failed: ${error.message}`); }
}

function signOut(){
  clearTimeout(idleTimeout);
  sessionStorage.removeItem('acms-token'); sessionStorage.removeItem('acms-user');
  state.token=null; state.user=null; state.role=null; state.open=null;
  $('#app-shell').hidden=true; $('#login-screen').hidden=false;
  $('#loginForm').reset();
  $('#login-error').textContent='';
}

async function logout(){
  let revocationError='';
  try{ await api('/api/auth/logout',{method:'POST'}); }
  catch(error){ revocationError=error.message; }
  signOut();
  if(revocationError) $('#login-error').textContent=`Signed out locally, but the server session could not be revoked: ${revocationError}`;
}

async function login(event){
  event.preventDefault();
  const form=new FormData(event.currentTarget), button=$('#login-submit');
  button.disabled=true; $('#login-error').textContent='';
  try{
    const result=await api(adminPortal?'/api/admin/auth/login':'/api/auth/login',{method:'POST',body:JSON.stringify({email:form.get('email'),pin:form.get('pin')})});
    state.token=result.token; state.user=result.user; state.role=result.user.role; state.view='dashboard';
    sessionStorage.setItem('acms-token',state.token); sessionStorage.setItem('acms-user',JSON.stringify(state.user));
    resetIdleTimeout();
    await enterWorkspace();
  }catch(error){$('#login-error').textContent=error.message;}
  finally{button.disabled=false;}
}

async function enterWorkspace(errorTarget=$('#login-error')){
  try{
    if(!state.user) state.user=JSON.parse(sessionStorage.getItem('acms-user')||'null');
    if(!state.user || !state.token) return signOut();
    state.role=state.user.role;
    if(adminPortal!==(state.role==='Admin')){
      signOut();
      errorTarget.textContent=adminPortal?'This portal is for administrators only.':'Administrator accounts must use the administrator portal.';
      return;
    }
    if(!allowed().some(item=>item.id===state.view)) state.view=allowed()[0]?.id||'dashboard';
    await refreshData();
    $('#login-screen').hidden=true; $('#app-shell').hidden=false;
    $('#account-name').textContent=state.user.name;
    $('#account-role').textContent=state.user.role;
    resetIdleTimeout();
    render();
  }catch(error){
    if(error.status===401) return;
    signOut(); errorTarget.textContent=error.message;
  }
}

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.remove('show'),2400); }

/* ---------- Views ---------- */
const views = {
 dashboard(){
  const today = new Date().toISOString().slice(0,10);
  const queue = appts.filter(a=>a.date===today);
  const low = state.dashboard.stockAlerts;
  const unpaid = state.dashboard.outstanding;
  const week = state.dashboard.weekly;
  const peak = Math.max(1,...week.map(day=>day.count));
  return {title:'Dashboard', sub:new Date().toLocaleDateString('en-UG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}), actions:state.role==='Admin'?'':'<button class="btn primary" data-act="book">Book appointment</button>', html:`
   ${['Admin','Doctor'].includes(state.role)&&criticalLabs.length?`<div class="card alertbar"><b>Unacknowledged critical laboratory results</b>${criticalLabs.map(result=>`<div class="q"><span>${esc(result.lab_orders?.patients?.mrn||'')}</span><div><b>${esc(result.lab_orders?.patients?.name||'Patient')} · ${esc(result.lab_orders?.test_name||'Test')}</b><small>${esc(result.result_value)} ${esc(result.unit)} · ${esc(result.flag)}</small></div>${state.role==='Doctor'?`<button class="btn sm" data-act="acknowledgeLab" data-id="${esc(result.id)}">Acknowledge</button>`:''}</div>`).join('')}</div>`:''}
   <div class="grid kpis dashboard-kpis">
    <div class="card kpi"><b>${queue.length}</b><span>Patients today</span></div>
    <div class="card kpi warn"><b>${queue.filter(a=>['Booked','Confirmed'].includes(a.status)).length}</b><span>Waiting to check in</span></div>
    <div class="card kpi ok"><b>${queue.filter(a=>a.status==='Checked in').length}</b><span>Checked in</span></div>
    <div class="card kpi alert"><b>${low??'—'}</b><span>Stock alerts</span></div>
    <div class="card kpi"><b>${unpaid===null?'—':UGX(unpaid)}</b><span>Outstanding payments</span></div>
   </div>
   <div class="grid two dashboard-panels">
    <div class="card dashboard-card"><h2>Today's queue</h2><div class="queue">${queue.map(a=>`
      <div class="q"><time>${esc(a.time)}</time><div><b>${esc(pat(a.pid)?.name||a.patient_name)}</b><small>${esc(a.type)} · ${esc(a.doc)}</small></div>${pill(esc(a.status),stColor[a.status]||'grey')}</div>`).join('')||'<p class="empty dashboard-empty">No patients are scheduled for today.</p>'}</div></div>
    <div class="card dashboard-card"><h2>Appointments this week</h2>${week.length?`<div class="bars">${week.map(day=>`<div><em>${day.count}</em><i style="height:${Math.max(4,day.count/peak*112)}px"></i>${new Date(day.date+'T00:00:00').toLocaleDateString('en',{weekday:'short'})}</div>`).join('')}</div>`:'<p class="empty dashboard-empty">No appointments in the past seven days.</p>'}</div>
   </div>`};
 },
 triage(){
  return {title:'Triage queue',sub:'Waiting patients sorted by assigned ESI level (1 is highest urgency)',actions:state.role==='Nurse'?'<button class="btn primary" data-act="addTriage">Triage patient</button>':'',html:`
   <div class="card wrap"><table class="tbl"><tr><th>Priority</th><th>Patient / MRN</th><th>Arrived</th><th>Notes</th><th>Status</th><th></th></tr>
   ${triageQueue.map(item=>`<tr><td>${pill(`ESI ${item.esi_level}`,Number(item.esi_level)<=2?'red':'amber')}</td><td><b>${esc(item.patient_name)}</b><small>${esc(item.mrn)}</small></td><td>${esc(new Date(item.created_at).toLocaleString())}</td><td>${esc(item.notes||'')}</td><td>${esc(item.status)}</td><td><button class="btn sm" data-act="triageStatus" data-id="${esc(item.id)}" data-status="In care">Start care</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No patients are waiting in triage.</td></tr>'}
   </table></div><p class="form-hint">ESI is assigned by a trained clinician. This prototype does not determine triage level or replace emergency assessment.</p>`};
 },
 lab(){
  return {title:'Laboratory',sub:'Test orders, reference ranges, and critical-result alerts',actions:['Admin','Doctor','Nurse'].includes(state.role)?'<button class="btn primary" data-act="orderLab">Order test</button>':'',html:`
   ${['Admin','Doctor'].includes(state.role)&&criticalLabs.length?`<div class="card alertbar"><b>Critical results awaiting doctor acknowledgment</b>${criticalLabs.map(result=>`<p>${esc(result.lab_orders?.patients?.mrn||'')} · ${esc(result.lab_orders?.patients?.name||'Patient')} · ${esc(result.lab_orders?.test_name||'Test')}: ${esc(result.result_value)} ${esc(result.unit)} (${esc(result.flag)}) ${state.role==='Doctor'?`<button class="btn sm" data-act="acknowledgeLab" data-id="${esc(result.id)}">Acknowledge</button>`:''}</p>`).join('')}</div>`:''}
   <div class="card wrap"><table class="tbl"><tr><th>Patient / MRN</th><th>Test</th><th>Ordered</th><th>Status</th><th>Results</th><th></th></tr>
   ${labOrders.map(order=>`<tr><td>${esc(order.patient_name)}<small>${esc(order.mrn)}</small></td><td>${esc(order.test_name)}</td><td>${esc(new Date(order.created_at).toLocaleDateString())}</td><td>${esc(order.status)}</td><td>${(order.lab_results||[]).map(result=>`${esc(result.result_value)} ${esc(result.unit)} <small>Reference: ${esc(result.reference_low)}-${esc(result.reference_high)} ${esc(result.unit)}</small> ${pill(esc(result.flag),result.flag.startsWith('Critical')?'red':result.flag==='Normal'?'green':'amber')}`).join('<br>')||'—'}</td><td>${state.role==='Lab'&&order.status==='Pending'?`<button class="btn sm" data-act="addLabResult" data-id="${esc(order.id)}" data-name="${esc(order.test_name)}">Enter result</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No lab orders.</td></tr>'}
   </table></div><p class="form-hint">Reference intervals and critical limits must be set by the laboratory for the specific test, method and patient context.</p>`};
 },
 pharmacy(){
  return {title:'Pharmacy dispensing',sub:'Pending prescriptions · dispensing checks expiry and available stock',actions:'',html:`
   <div class="card wrap"><table class="tbl"><tr><th>Patient / MRN</th><th>Medication</th><th>Directions</th><th>Ordered</th><th></th></tr>
   ${pharmacyOrders.map(order=>`<tr><td>${esc(order.patient_name)}<small>${esc(order.mrn)}</small></td><td>${esc(order.drug)}</td><td>${esc(order.dose)}</td><td>${esc(order.date)}</td><td><button class="btn sm primary" data-act="dispense" data-id="${esc(order.id)}" data-drug="${esc(order.drug)}">Dispense</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No pending prescriptions.</td></tr>'}
   </table></div><p class="form-hint">Allergy conflicts block prescribing. Pharmacy dispensing is recorded against stock and the responsible staff account.</p>`};
 },
 medications(){
  return {title:'Medication catalog',sub:'Active ingredients and drug classes used for prototype safety checks',actions:state.role==='Admin'?'<button class="btn primary" data-act="addMedication">Add medication</button>':'',html:`
   <div class="card wrap"><table class="tbl"><tr><th>Medicine</th><th>Active ingredient</th><th>Classes</th></tr>
   ${medications.map(med=>`<tr><td>${esc(med.name)}</td><td>${esc(med.active_ingredient)}</td><td>${esc((med.drug_classes||[]).join(', '))}</td></tr>`).join('')||'<tr><td colspan="3" class="empty">No medications have been added to the catalog.</td></tr>'}</table></div>
   <p class="form-hint">Medication names, ingredients and allergy classes require pharmacist validation before clinical use.</p>`};
 },
 wards(){
  return {title:'Admissions and wards',sub:'Active admissions and ward capacity',actions:`${state.role==='Admin'?'<button class="btn" data-act="createWard">Add ward</button>':''}${['Admin','Doctor','Nurse'].includes(state.role)?'<button class="btn primary" data-act="admitPatient">Admit patient</button>':''}`,html:`
   <div class="grid two"><div class="card"><h2>Ward capacity</h2>${wards.map(ward=>`<div class="q"><b>${esc(ward.name)}</b><span>${esc(ward.occupied)} / ${esc(ward.capacity)} beds</span></div>`).join('')||'<p class="empty">No active wards configured.</p>'}</div>
   <div class="card"><h2>Current admissions</h2>${admissions.map(item=>`<div class="q"><div><b>${esc(item.patient_name)} · ${esc(item.mrn)}</b><small>${esc(item.ward_name)} · ${esc(new Date(item.admitted_at).toLocaleString())}</small></div><button class="btn sm" data-act="discharge" data-id="${esc(item.id)}">Discharge</button></div>`).join('')||'<p class="empty">No active admissions.</p>'}</div></div>
   <p class="form-hint">Admission limits are enforced by the database when patients are admitted.</p>`};
 },
 patients(){
  const q = state.q.toLowerCase();
   const list = patients.filter(p => (`${p.name} ${p.id} ${p.mrn||''} ${p.phone||''}`).toLowerCase().includes(q));
   return {title:'Patients', sub:'Search by medical record number, name or phone number',
    actions: ['Admin','Receptionist'].includes(state.role) ? '<button class="btn primary" data-act="register">Register patient</button>' : '', html:`
  <div class="tools"><input id="search" type="search" placeholder="Search patients" value="${esc(state.q)}" aria-label="Search patients"></div>
    <div class="card wrap"><table class="tbl"><tr><th>MRN</th><th>Name</th><th>Age</th><th>Phone</th><th>Flags</th></tr>
   ${list.map(p=>`<tr class="click" data-act="open" data-id="${esc(p.id)}" tabindex="0"><td>${esc(p.mrn||p.id)}</td><td><b>${esc(p.name)}</b></td><td>${esc(p.age)}</td><td>${esc(p.phone)}</td>
   <td>${p.allergies.length?pill('Allergy: '+esc(p.allergies.join(', ')),'red'):''} ${p.cond.map(c=>pill(esc(c),'amber')).join(' ')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No patients match. Try another name or ID.</td></tr>'}
   </table></div>`};
 },
 schedules(){
   const names=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
   return {title:'Doctor schedules', sub:'Weekly working hours and appointment slot length', actions:'', html:`
   <div class="card wrap"><table class="tbl"><tr><th>Doctor</th>${names.map(n=>`<th>${n}</th>`).join('')}<th></th></tr>
   ${schedules.map(doc=>`<tr><td><b>${esc(doc.name)}</b><br><small>${esc(doc.specialty||'')} · ${esc(doc.slot_minutes)} min slots</small></td>${names.map((_,i)=>{const e=doc.days.find(x=>x.weekday===i);return `<td>${e?esc(e.start_time.slice(0,5))+'–'+esc(e.end_time.slice(0,5)):'<small>Off</small>'}</td>`;}).join('')}
   <td>${state.role==='Admin'?`<button class="btn sm" data-act="editSchedule" data-id="${esc(doc.id)}">Edit</button>`:''}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No active doctors found.</td></tr>'}
   </table></div>`};
 },
 appts(){
   const rows = appts;
   return {title:'Appointments', sub:'Manage bookings, check-ins and queue',
    actions:['Admin','Receptionist','Nurse'].includes(state.role)?'<button class="btn primary" data-act="book">Book appointment</button>':'', html:`
   <div class="card wrap"><table class="tbl"><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Type</th><th>Reason for visit</th><th>Status</th><th></th></tr>
  ${rows.map(a=>`<tr><td><b>${esc(a.date)} ${esc(a.time)}</b></td><td>${esc(pat(a.pid)?.name||a.patient_name)}</td><td>${esc(a.doc)}</td><td>${esc(a.type)}</td><td>${esc(a.reason||'—')}</td><td>${pill(esc(a.status),stColor[a.status]||'grey')}</td>
     <td>${['Admin','Receptionist','Nurse'].includes(state.role)&&(['Booked','Confirmed'].includes(a.status)?`<button class="btn sm" data-act="checkin" data-id="${esc(a.id)}">Check in</button> `:'')}${['Admin','Receptionist','Nurse'].includes(state.role)&&a.status!=='Completed'&&a.status!=='Missed'&&a.status!=='Cancelled'?`<button class="btn sm" data-act="cancel" data-id="${esc(a.id)}">Cancel</button>`:''}${['Admin','Receptionist'].includes(state.role)&&a.status==='Cancelled'?`<button class="btn sm" data-act="deleteAppointment" data-id="${esc(a.id)}">Delete</button>`:''}</td></tr>`).join('')}
   </table></div>`};
 },
 billing(){
  const tot=invoices.filter(i=>i.paid).reduce((a,i)=>a+i.amt,0), owing=compliance.items;
  const canBill=state.role==='Admin'||state.role==='Receptionist';
  const summary=i=>i.lines&&i.lines.length?[...new Set(i.lines.map(l=>l.category))].join(', '):(i.items||'');
  return {title:'Billing and invoices', sub:'Collected: '+UGX(tot), actions:canBill?'<button class="btn primary" data-act="addCharge">Add charge</button>':'', html:`
   ${owing.length?`<div class="alertbar">${owing.length} patient${owing.length>1?'s are':' is'} missing compulsory fees: ${owing.slice(0,3).map(i=>esc(i.name)).join(', ')}${owing.length>3?'…':''} <button class="btn sm" data-act="chargeMissing">Charge missing fees</button></div>`:'<div class="card" style="margin-bottom:14px">✓ Every patient has the compulsory fees on their bill.</div>'}
   <div class="card wrap"><table class="tbl"><tr><th>Invoice</th><th>Patient</th><th>Charges</th><th>Amount</th><th>Status</th><th></th></tr>
  ${invoices.map(i=>`<tr><td>${esc(i.id)}</td><td>${esc(pat(i.pid)?.name||i.patient_name)}</td><td>${esc(summary(i))}${i.lines&&i.lines.length?` <small>(${i.lines.length} line${i.lines.length>1?'s':''})</small>`:''}</td><td><b>${UGX(i.amt)}</b></td>
   <td>${pill(i.paid?'Paid':'Pending','' + (i.paid?'green':'amber'))}${(i.missing||[]).length?' '+pill('Missing: '+esc(i.missing.join(', ')),'red'):''}</td>
   <td><button class="btn sm" data-act="viewBill" data-id="${esc(i.id)}">View bill</button> ${!i.paid?`<button class="btn sm" data-act="pay" data-id="${esc(i.id)}">Record payment</button>`:''}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No invoices yet.</td></tr>'}
   </table></div>`};
 },
 fees(){
  const admin=state.role==='Admin', unitLabel={once:'Once per patient',visit:'Every visit',test:'Per test',day:'Per day',procedure:'Per procedure',unit:'Per unit'};
  const gaps=[['Diagnostics (tests)',feeGaps.diagnostics],['Medicine',feeGaps.medicine],['Bed space (wards)',feeGaps.bed]].filter(x=>x[1].length);
  return {title:'Fee schedule', sub:'Compulsory fees are charged automatically; treatment and facility fees are charged as services are delivered', actions:admin?'<button class="btn primary" data-act="newFee">Add fee</button>':'', html:`
   <div class="card wrap"><table class="tbl"><tr><th>Category</th><th>Fee</th><th>Amount</th><th>Charged</th><th>Type</th><th>Status</th><th></th></tr>
   ${fees.map(f=>`<tr><td>${esc(f.category)}</td><td><b>${esc(f.name)}</b></td><td>${UGX(f.amount)}</td><td>${esc(unitLabel[f.unit]||f.unit)}</td><td>${pill(f.compulsory?'Compulsory':'Optional',f.compulsory?'red':'blue')}</td><td>${pill(f.active?'Active':'Inactive',f.active?'green':'grey')}</td>
    <td>${admin?`<button class="btn sm" data-act="editFee" data-id="${esc(f.id)}">Edit</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="empty">No fees yet.</td></tr>'}
   </table></div>
   ${gaps.length?`<div class="card" style="margin-top:14px"><h2>Services without a price</h2><p class="form-hint">These are delivered but cannot be billed until a fee with exactly the same name is added.</p>${gaps.map(([c,l])=>`<p><b>${esc(c)}:</b> ${l.map(esc).join(', ')}</p>`).join('')}</div>`:''}`};
 },
 stock(){
  return {title:'Pharmacy stock', sub:'Low-stock and near-expiry alerts', actions:'', html:`
   <div class="card wrap"><table class="tbl"><tr><th>Item</th><th>In stock</th><th>Reorder at</th><th>Expiry</th><th>Supplier</th><th>Status</th><th></th></tr>
  ${stock.map((s,i)=>{const [t]=stockState(s);const alerts=s.alerts&&s.alerts.length?s.alerts:[t];return `<tr><td><b>${esc(s.item)}</b></td><td>${esc(s.qty)}</td><td>${esc(s.reorder)}</td><td>${esc(s.exp||'Not recorded')}</td><td>${esc(s.sup)}</td><td>${alerts.map(alert=>pill(esc(alert),alert==='Low stock'||alert==='Expired'?'red':alert==='Near expiry'?'amber':'green')).join(' ')}</td>
   <td>${state.role==='Admin'?`<button class="btn sm" data-act="restock" data-id="${i}">Add stock</button>`:''}</td></tr>`}).join('')}
   </table></div>`};
 },
 admin(){
  return {title:'Administration', sub:'Manage staff accounts and review system activity', actions:'<button class="btn" data-act="newUser" data-role="Doctor">Add doctor</button><button class="btn" data-act="newUser" data-role="Receptionist">Add receptionist</button><button class="btn primary" data-act="newUser">Add user</button>', html:`
   <div class="grid two"><div class="card wrap"><h2>User accounts</h2><table class="tbl"><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr>
  ${users.map((u,i)=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.role)}${u.specialty?` · ${esc(u.specialty)}`:''}</td><td>${pill(u.active?'Active':'Deactivated',u.active?'green':'grey')}</td>
   <td><button class="btn sm" data-act="resetPin" data-id="${i}">Issue new PIN</button> <button class="btn sm" data-act="toggleUser" data-id="${i}">${u.active?'Deactivate':'Activate'}</button></td></tr>`).join('')}</table></div>
  <div class="card"><h2>Recent activity</h2>${(state.audit||[]).map(a=>`<details><summary>${esc(a.action)} · ${esc(a.user||'System')}</summary><p>${esc(a.detail)}<br><small>${esc(a.at)}</small></p></details>`).join('')||'<p class="empty">No activity recorded yet.</p>'}</div></div>`};
 }
};

/* ---------- Patient slide-out panel (EMR, prescriptions) ---------- */
function renderPanel(){
  const el = $('#panel'), p = state.open && pat(state.open);
  el.classList.toggle('open', !!p); el.setAttribute('aria-hidden', !p);
  if(!p){ el.innerHTML=''; return; }
  const canWrite = state.role==='Doctor'||state.role==='Admin';
  const tabs = ['overview','visits','prescriptions'];
  const body = {
  overview:`${['Admin','Doctor','Nurse'].includes(state.role)?'<button class="btn sm" data-act="recordVitals">Record vital signs</button><br><br>':''}<dl class="kv"><dt>MRN</dt><dd>${esc(p.mrn||p.id)}</dd><dt>Date of birth</dt><dd>${esc(p.date_of_birth||'Not recorded')}</dd><dt>Age / sex</dt><dd>${esc(p.age)} / ${esc(p.sex)}</dd><dt>Phone</dt><dd>${esc(p.phone)}</dd><dt>Next of kin</dt><dd>${esc(p.kin)}</dd>
     <dt>Conditions</dt><dd>${esc(p.cond.length?p.cond.join(', '):'None recorded')}</dd></dl>`,
   visits:(canWrite?'<button class="btn sm primary" data-act="note">Add SOAP note</button><br><br>':'') +
    (p.visits.map(v=>`<details><summary>${esc(v.d)} · ${esc(v.assessment||v.dx||'Clinical note')}</summary><p>${v.icd10_code?`<b>ICD-10:</b> ${esc(v.icd10_code)}<br>`:''}${v.subjective?`<b>Subjective:</b> ${esc(v.subjective)}<br>`:''}${v.objective?`<b>Objective:</b> ${esc(v.objective)}<br>`:''}${v.assessment?`<b>Assessment:</b> ${esc(v.assessment)}<br>`:''}<b>Plan:</b> ${esc(v.plan||v.n||'')}<br><small>${esc(v.doc)}</small></p></details>`).join('') || '<p class="empty">No visits recorded yet.</p>'),
   prescriptions:(canWrite?'<button class="btn sm primary" data-act="rx">New prescription</button><br><br>':'') +
      (p.rx.map(r=>`<details><summary>${esc(r.drug)}</summary><p>${esc(r.dose)}<br><small>Prescribed ${esc(r.d)}</small></p></details>`).join('') || '<p class="empty">No prescriptions yet.</p>')
  };
    el.innerHTML = `<div class="panel-head"><div><h2>${esc(p.name)}</h2></div><button class="btn sm" data-act="close" aria-label="Close panel">Close</button></div>
    ${p.allergies.length?`<div class="alertbar">Allergy alert: ${esc(p.allergies.join(', '))}</div>`:''}
   <div class="tabs" role="tablist">${tabs.map(t=>`<button role="tab" aria-selected="${state.tab===t}" data-act="tab" data-id="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>${body[state.tab]}`;
}

/* ---------- Dialogs ---------- */
function dialog(html, onSave){
  const f = $('#dlgForm'); f.innerHTML = html + '<p class="dialog-error" role="alert" aria-live="polite"></p><div class="row-end"><button class="btn" type="submit" value="cancel" formnovalidate>Cancel</button><button class="btn primary" type="submit" value="ok">Save</button></div>';
  f.onsubmit = e => {
    if(!e.submitter || e.submitter.value!=='ok') return;
    e.preventDefault();
    const saveButton=e.submitter, errorMessage=f.querySelector('.dialog-error');
    const values=Object.fromEntries(new FormData(f));
    errorMessage.textContent='';
    saveButton.disabled=true;
    saveButton.textContent='Saving...';
    Promise.resolve().then(()=>onSave(values))
      .then(result=>{
        $('#dlg').close();
        if(result?.issuedPin) showIssuedPin(result.name,result.issuedPin);
      })
      .catch(error=>{errorMessage.textContent=error.message;})
      .finally(()=>{saveButton.disabled=false;saveButton.textContent='Save';});
  };
  $('#dlg').showModal();
}
function showIssuedPin(name,pin){
  const form=$('#dlgForm');
  form.innerHTML=`<h2>One-time staff PIN</h2><p>Share this unique PIN securely with ${esc(name)}. It will not be shown again.</p><label for="issued-pin">Staff PIN</label><input id="issued-pin" value="${esc(pin)}" readonly><p class="dialog-error">Prototype PINs are not suitable for real clinical deployment.</p><div class="row-end"><button class="btn" id="copy-issued-pin" type="button">Copy PIN</button><button class="btn primary" type="submit" value="close">Close</button></div>`;
  form.onsubmit=event=>{event.preventDefault();$('#dlg').close();};
  $('#dlg').showModal();
  $('#copy-issued-pin').addEventListener('click',async()=>{
    await navigator.clipboard.writeText(pin);
    toast('PIN copied');
  });
  $('#issued-pin').select();
}
const opts = a => a.map(x=>`<option value="${esc(x.v??x)}">${esc(x.t??x)}</option>`).join('');
const actions = {
 close(){ state.open=null; renderPanel(); },
 changePin(){
  dialog(`<h2>Change PIN</h2><label>Current PIN or initial administrator credential</label><input name="current_pin" type="password" autocomplete="current-password" required><label>New 8-digit PIN</label><input name="new_pin" type="password" inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" autocomplete="new-password" required><label>Confirm new PIN</label><input name="confirm_pin" type="password" inputmode="numeric" pattern="[0-9]{8}" minlength="8" maxlength="8" autocomplete="new-password" required>`,async d=>{
   if(d.new_pin!==d.confirm_pin) throw new Error('The new PINs do not match.');
   await api('/api/auth/change-pin',{method:'POST',body:JSON.stringify({current_pin:d.current_pin,new_pin:d.new_pin})}); toast('PIN changed');
  });
 },
 async open(el){
  const data=await api('/api/patients/'+encodeURIComponent(el.dataset.id));
  const p=pat(data.id);
  if(p) Object.assign(p,data,{kin:data.next_of_kin||'',cond:data.conditions||[],visits:(data.visits||[]).map(v=>({...v,d:v.date,dx:v.diagnosis,n:v.notes})),rx:(data.prescriptions||[]).map(r=>({...r,d:r.date}))});
  state.open=el.dataset.id; state.tab='overview'; renderPanel();
 },
 tab(el){ state.tab=el.dataset.id; renderPanel(); },
 async checkin(el){ await api('/api/appointments/'+el.dataset.id,{method:'PATCH',body:JSON.stringify({status:'Checked in'})}); await refreshAfterMutation('Patient checked in'); },
 async cancel(el){
  if(!confirm('Cancel this appointment?')) return;
  el.disabled=true;
  const appointment=appts.find(item=>String(item.id)===el.dataset.id);
  try{
   await api('/api/appointments/'+encodeURIComponent(el.dataset.id),{method:'PATCH',body:JSON.stringify({status:'Cancelled'})});
   if(appointment) appointment.status='Cancelled';
   render();
   toast('Appointment cancelled');
   try{ await refreshData(); render(); }
   catch(error){ toast('Appointment cancelled, but the list could not be refreshed: '+error.message); }
  }finally{
   if(el.isConnected) el.disabled=false;
  }
 },
 async deleteAppointment(el){
  if(!confirm('Permanently delete this cancelled appointment? This cannot be undone.')) return;
  await api('/api/appointments/'+el.dataset.id,{method:'DELETE'});
 await refreshAfterMutation('Cancelled appointment deleted');
 },
 async pay(el){
  dialog(`<h2>Record payment</h2><label>Payment method</label><select name="method" required>${opts(['Cash','Mobile money','Insurance','Card'])}</select>`,async d=>{
   await api('/api/invoices/'+el.dataset.id+'/pay',{method:'POST',body:JSON.stringify({method:d.method})});
  await refreshAfterMutation('Payment recorded');
  });
 },
 restock(el){
  const item=stock[el.dataset.id];
  dialog(`<h2>Restock ${item.item}</h2><label>Quantity to add</label><input name="qty" type="number" min="1" step="1" value="100" required>`,async d=>{
   await api('/api/admin/stock/'+item.id+'/restock',{method:'POST',body:JSON.stringify({qty:Number(d.qty)})}); await refreshAfterMutation('Stock updated');
  });
 },
 async toggleUser(el){ const u=users[el.dataset.id]; await api('/api/admin/users/'+u.id,{method:'PATCH',body:JSON.stringify({active:!u.active})}); await refreshAfterMutation(u.active?'Account deactivated':'Account activated'); },
 async newUser(el){
  const initialRole=el.dataset.role||'';
  const specialties=!initialRole||initialRole==='Doctor'?await api('/api/admin/specialities'):[];
  const specialtyOptions=specialties.length?opts(specialties):'<option value="" disabled>No specialist titles available</option>';
  dialog(`<h2>Create staff account</h2><p class="form-hint">A unique 8-digit demo PIN will be generated and shown once after account creation.</p><label>Full name</label><input name="name" autocomplete="name" required><label>Email</label><input name="email" type="email" autocomplete="email" required><label for="new-user-role">Role</label><select name="role" id="new-user-role" required><option value="" disabled ${initialRole?'':'selected'}>Choose a staff role</option>${opts(['Doctor','Receptionist','Nurse','Pharmacist','Lab','Admin'])}</select><div id="doctor-specialty-field" hidden><label for="new-user-specialty">Specialist title</label><select id="new-user-specialty" name="specialty"><option value="">Choose a specialist title</option>${specialtyOptions}</select></div>`,async d=>{
   if(d.role!=='Doctor') d.specialty='';
  const created=await api('/api/admin/users',{method:'POST',body:JSON.stringify(d)});
  await refreshAfterMutation('User account created');
  return {name:d.name,issuedPin:created.pin};
  });
  const role=$('#new-user-role'), specialty=$('#new-user-specialty'), specialtyField=$('#doctor-specialty-field');
  role.value=initialRole;
  const updateSpecialtyVisibility=()=>{
   const isDoctor=role.value==='Doctor';
   specialtyField.hidden=!isDoctor;
   specialty.required=isDoctor;
  };
  role.addEventListener('change',updateSpecialtyVisibility);
  updateSpecialtyVisibility();
 },
 async resetPin(el){
  const user=users[el.dataset.id];
  if(!confirm(`Issue a new PIN for ${user.name}? Their current PIN will stop working.`)) return;
  const result=await api('/api/admin/users/'+user.id+'/reset-pin',{method:'POST'});
  showIssuedPin(user.name,result.pin);
  await refreshAfterMutation('PIN reset');
 },
 async triageStatus(el){
  await api('/api/triage/'+el.dataset.id,{method:'PATCH',body:JSON.stringify({status:el.dataset.status})});
  await refreshAfterMutation('Triage status updated');
 },
 addTriage(){
  dialog(`<h2>Record triage assessment</h2><p class="form-hint">ESI is a clinician-assigned priority. This prototype does not determine or validate triage level.</p><label>Patient</label><select name="patient_id" required>${opts(patients.map(p=>({v:p.id,t:`${p.name} · ${p.mrn||p.id}`})))}</select><label>Emergency Severity Index (ESI)</label><select name="esi_level" required>${opts([1,2,3,4,5].map(level=>({v:String(level),t:`Level ${level}`})))}</select><label>Notes (optional)</label><textarea name="notes" maxlength="2000"></textarea>`,async d=>{
   await api('/api/triage',{method:'POST',body:JSON.stringify(d)}); await refreshAfterMutation('Triage assessment added');
  });
 },
 recordVitals(){
  const p=pat(state.open);
  dialog(`<h2>Record vital signs</h2><p class="alertbar">Prototype NEWS2 Scale 1 only. Not clinically validated; follow local escalation policy. A responsible clinician must review the score before action. For patients requiring Scale 2, do not use this score.</p><label>Respiratory rate (/min)</label><input name="respiratory_rate" type="number" min="1" max="80" step="1" required><label>Oxygen saturation (%)</label><input name="oxygen_saturation" type="number" min="50" max="100" step="1" required><label>Systolic blood pressure (mmHg)</label><input name="systolic_blood_pressure" type="number" min="40" max="300" required><label>Pulse (/min)</label><input name="pulse_rate" type="number" min="20" max="250" required><label>Temperature (°C)</label><input name="temperature" type="number" min="25" max="45" step="0.1" required><label>Consciousness</label><select name="consciousness" required>${opts(['Alert','Confusion','Voice','Pain','Unresponsive'])}</select><label><input name="supplemental_oxygen" type="checkbox" value="true"> Receiving supplemental oxygen</label>`,async d=>{
   const result=await api('/api/patients/'+encodeURIComponent(p.id)+'/vitals',{method:'POST',body:JSON.stringify({...d,supplemental_oxygen:d.supplemental_oxygen==='true'})});
   alert(`Prototype NEWS2 score: ${result.score}\nSuggested escalation: ${result.escalation}\n\n${result.prototype_notice}\nResponsible clinician review is required before action.`);
   await refreshAfterMutation('Vital signs recorded'); await actions.open({dataset:{id:p.id}});
  });
 },
 async orderLab(){
  dialog(`<h2>Order laboratory test</h2><label>Patient</label><select name="patient_id" required>${opts(patients.map(p=>({v:p.id,t:`${p.name} · ${p.mrn||p.id}`})))}</select><label>Test name</label><input name="test_name" maxlength="160" required>`,async d=>{
   await api('/api/lab/orders',{method:'POST',body:JSON.stringify(d)}); await refreshAfterMutation('Lab order created');
  });
 },
 async addLabResult(el){
  dialog(`<h2>Enter result: ${esc(el.dataset.name)}</h2><label>Result</label><input name="result_value" type="number" step="any" required><label>Unit</label><input name="unit" maxlength="32" required><label>Reference low</label><input name="reference_low" type="number" step="any" required><label>Reference high</label><input name="reference_high" type="number" step="any" required><label>Critical low (optional)</label><input name="critical_low" type="number" step="any"><label>Critical high (optional)</label><input name="critical_high" type="number" step="any"><p class="form-hint">Use the laboratory-approved interval and critical limits for this test and patient.</p>`,async d=>{
   const result=await api('/api/lab/orders/'+el.dataset.id+'/results',{method:'POST',body:JSON.stringify(d)});
   await refreshAfterMutation(result.critical?'Critical result recorded':'Result recorded');
  });
 },
 async acknowledgeLab(el){
  if(!confirm('Acknowledge this critical result? This records your account and time.')) return;
  await api('/api/lab/results/'+el.dataset.id+'/acknowledge',{method:'POST'});
  await refreshAfterMutation('Critical result acknowledged');
 },
 addMedication(){
  dialog(`<h2>Add medication to catalog</h2><label>Display name</label><input name="name" maxlength="160" required><label>Active ingredient</label><input name="active_ingredient" maxlength="160" required><label>Drug classes (comma separated)</label><input name="drug_classes" placeholder="e.g. penicillin, beta-lactam">`,async d=>{
   await api('/api/admin/medications',{method:'POST',body:JSON.stringify({...d,drug_classes:d.drug_classes.split(',').map(value=>value.trim()).filter(Boolean)})});
   await refreshAfterMutation('Medication added to catalog');
  });
 },
 dispense(el){
  const order=pharmacyOrders.find(item=>String(item.id)===el.dataset.id);
  const matchingStock=stock.filter(item=>item.item.toLowerCase()===order.drug.toLowerCase());
  if(!matchingStock.length) throw new Error('No matching stock item is configured for this medication. Contact the administrator.');
  dialog(`<h2>Dispense ${esc(order.drug)}</h2><p>${esc(order.patient_name)} · ${esc(order.mrn)}</p><label>Matching stock item</label><select name="stock_id" required>${opts(matchingStock.map(item=>({v:String(item.id),t:`${item.item} · ${item.qty} available · expires ${item.exp||'not recorded'}`})))}</select><label>Quantity</label><input name="quantity" type="number" min="1" step="1" required>`,async d=>{
   await api('/api/pharmacy/prescriptions/'+order.id+'/dispense',{method:'POST',body:JSON.stringify({stock_id:Number(d.stock_id),quantity:Number(d.quantity)})});
   await refreshAfterMutation('Prescription dispensed');
  });
 },
 createWard(){
  dialog(`<h2>Add ward</h2><label>Ward name</label><input name="name" maxlength="120" required><label>Bed capacity</label><input name="capacity" type="number" min="1" step="1" required>`,async d=>{
   await api('/api/admin/wards',{method:'POST',body:JSON.stringify({name:d.name,capacity:Number(d.capacity)})});
   await refreshAfterMutation('Ward created');
  });
 },
 admitPatient(){
  const available=wards.filter(ward=>ward.occupied<ward.capacity);
  if(!available.length) throw new Error('No available ward beds.');
  dialog(`<h2>Admit patient</h2><label>Patient</label><select name="patient_id" required>${opts(patients.map(p=>({v:p.id,t:`${p.name} · ${p.mrn||p.id}`})))}</select><label>Available ward</label><select name="ward_id" required>${opts(available.map(ward=>({v:String(ward.id),t:`${ward.name} · ${ward.capacity-ward.occupied} beds available`})))}</select>`,async d=>{
   await api('/api/admissions',{method:'POST',body:JSON.stringify({patient_id:d.patient_id,ward_id:Number(d.ward_id)})});
   await refreshAfterMutation('Patient admitted');
  });
 },
 discharge(el){
  dialog(`<h2>Discharge patient</h2><label>Discharge summary / notes (optional)</label><textarea name="notes" maxlength="4000"></textarea>`,async d=>{
   await api('/api/admissions/'+el.dataset.id+'/discharge',{method:'POST',body:JSON.stringify(d)});
   await refreshAfterMutation('Patient discharged');
  });
 },
 addCharge(){
  const unitLabel={once:'once',visit:'per visit',test:'per test',day:'per day',procedure:'per procedure',unit:'per unit'};
  dialog(`<h2>Add charge</h2><label>Patient</label><select name="pid" required>${opts(patients.map(p=>({v:p.id,t:`${p.name} · ${p.mrn||p.id}`})))}</select>
   <label>Fee</label><select name="fee" required>${opts(fees.filter(f=>f.active).map(f=>({v:f.id,t:`${f.category} · ${f.name} · ${UGX(f.amount)} ${unitLabel[f.unit]}`})))}</select>
   <label>Quantity (days, units or procedures)</label><input name="qty" type="number" min="1" max="1000" step="1" value="1" required>
   <label>Note (optional)</label><input name="note" maxlength="200" placeholder="e.g. appendectomy">`, async d=>{
   await api('/api/patients/'+encodeURIComponent(d.pid)+'/charges',{method:'POST',body:JSON.stringify({fee_id:Number(d.fee),quantity:Number(d.qty),note:d.note})});
   await refreshAfterMutation('Charge added');
  });
 },
 viewBill(el){
  const inv=invoices.find(i=>i.id===el.dataset.id); if(!inv) return;
  const admin=state.role==='Admin'&&!inv.paid, f=$('#dlgForm');
  f.innerHTML=`<h2>${esc(inv.id)} · ${esc(pat(inv.pid)?.name||inv.patient_name||'')}</h2>
   <div class="wrap"><table class="tbl"><tr><th>Charge</th><th>Qty</th><th>Price</th><th>Amount</th><th></th></tr>
   ${(inv.lines||[]).map(l=>`<tr><td>${esc(l.description)}<br><small>${esc(l.category)} · ${esc(String(l.visit_date).slice(0,10))} · ${esc(l.source)}</small></td><td>${esc(l.quantity)}</td><td>${UGX(l.unit_price)}</td><td>${l.waived?`<s>${UGX(l.amount)}</s><br>${pill('Waived','grey')}`:`<b>${UGX(l.amount)}</b>`}</td><td>${admin&&!l.waived?`<button class="btn sm" type="button" data-act="waive" data-id="${esc(l.id)}">Waive</button>`:''}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">Older invoice without itemised lines: ${esc(inv.items)}</td></tr>`}
   </table></div><p><b>Total: ${UGX(inv.amt)}</b></p>${(inv.missing||[]).length?`<div class="alertbar">Missing compulsory fees: ${esc(inv.missing.join(', '))}</div>`:''}
   <div class="row-end"><button class="btn primary" type="submit" value="close">Close</button></div>`;
  f.onsubmit=e=>{e.preventDefault();$('#dlg').close();};
  $('#dlg').showModal();
 },
 waive(el){
  $('#dlg').close();
  dialog(`<h2>Waive charge</h2><p class="form-hint">A waived charge is removed from the total. The reason is recorded in the audit trail.</p><label>Reason</label><input name="reason" required minlength="5" maxlength="300">`, async d=>{
   await api('/api/invoices/lines/'+encodeURIComponent(el.dataset.id)+'/waive',{method:'POST',body:JSON.stringify({reason:d.reason})});
   await refreshAfterMutation('Charge waived');
  });
 },
 async chargeMissing(){
  if(!confirm('Add every missing compulsory fee to the patients’ bills?')) return;
  const r=await api('/api/billing/charge-missing',{method:'POST'});
  await refreshAfterMutation(r.charged?`${r.charged} missing fee${r.charged>1?'s':''} charged`:'No missing fees to charge');
 },
 newFee(){
  const defaults={Registration:'once',Consultation:'visit',Diagnostics:'test','Bed space':'day',Surgery:'procedure',Medicine:'unit'}, today=new Date().toISOString().slice(0,10);
  dialog(`<h2>Add fee</h2><label>Category</label><select name="category" id="fee-category" required>${opts(['Registration','Consultation','Diagnostics','Bed space','Surgery','Medicine'])}</select>
   <label>Name</label><input name="name" required minlength="2" maxlength="120"><p class="form-hint">For Diagnostics use the test name, for Medicine the stock item name, for Bed space the ward name, exactly as written in the system, so the charge is applied automatically.</p>
   <label>Amount (UGX)</label><input name="amount" type="number" min="0" step="1" required>
   <label>Charged</label><select name="unit" id="fee-unit" required>${opts([{v:'once',t:'Once per patient'},{v:'visit',t:'Every visit'},{v:'test',t:'Per test'},{v:'day',t:'Per day'},{v:'procedure',t:'Per procedure'},{v:'unit',t:'Per unit'}])}</select>
   <label>Compulsory for every patient?</label><select name="compulsory"><option value="false">No</option><option value="true">Yes</option></select>
   <label>Applies from</label><input name="effective_from" type="date" value="${today}" required>`, async d=>{
   await api('/api/admin/fees',{method:'POST',body:JSON.stringify({category:d.category,name:d.name,amount:Number(d.amount),unit:d.unit,compulsory:d.compulsory==='true',effective_from:d.effective_from})});
   await refreshAfterMutation('Fee added');
  });
  $('#fee-category').addEventListener('change',()=>{$('#fee-unit').value=defaults[$('#fee-category').value];});
 },
 editFee(el){
  const fee=fees.find(f=>String(f.id)===el.dataset.id); if(!fee) return;
  dialog(`<h2>${esc(fee.name)}</h2><label>Amount (UGX)</label><input name="amount" type="number" min="0" step="1" value="${esc(fee.amount)}" required><label>Status</label><select name="active"><option value="true"${fee.active?' selected':''}>Active</option><option value="false"${fee.active?'':' selected'}>Inactive</option></select>`, async d=>{
   await api('/api/admin/fees/'+encodeURIComponent(fee.id),{method:'PATCH',body:JSON.stringify({amount:Number(d.amount),active:d.active==='true'})});
   await refreshAfterMutation('Fee updated');
  });
 },
 register(){
  dialog(`<h2>Register patient</h2><label>Full name</label><input name="name" required minlength="2" maxlength="120"><label>Date of birth</label><input name="date_of_birth" type="date" max="${new Date().toISOString().slice(0,10)}" required>
   <label>Sex</label><select name="sex"><option value="">Prefer not to say</option><option value="F">Female</option><option value="M">Male</option><option value="Other">Other</option></select><label>Phone</label><input name="phone" required><label>Known allergies (optional, comma separated)</label><input name="all">`,async d=>{
   const payload={name:d.name,date_of_birth:d.date_of_birth,sex:d.sex,phone:d.phone,allergies:d.all?d.all.split(',').map(s=>s.trim()):[]};
   try{await api('/api/patients',{method:'POST',body:JSON.stringify(payload)});}
   catch(error){
    if(error.status!==409||!Array.isArray(error.body.duplicates)) throw error;
    const matches=error.body.duplicates.map(p=>`${p.name} · ${p.mrn||p.id}`).join('\n');
    if(!confirm(`${error.message}\n\nPossible existing record(s):\n${matches}\n\nContinue only after verifying the patient's identity.`)) throw error;
    await api('/api/patients',{method:'POST',body:JSON.stringify({...payload,duplicate_override:true})});
   }
   await refreshAfterMutation('Patient registered');
  });
 },
 editSchedule(el){
  const doc=schedules.find(item=>String(item.id)===el.dataset.id); if(!doc) return;
  const names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  dialog(`<h2>Working hours · ${esc(doc.name)}</h2><p class="form-hint">Leave both times empty for a day off.</p><label>Appointment length (minutes)</label><select name="slot">${opts([10,15,20,30,45,60])}</select>`+
   names.map((n,i)=>{const e=doc.days.find(x=>x.weekday===i);return `<label>${n}</label><div style="display:flex;gap:8px"><input type="time" name="s${i}" value="${e?esc(e.start_time.slice(0,5)):''}"><input type="time" name="e${i}" value="${e?esc(e.end_time.slice(0,5)):''}"></div>`;}).join(''), async d=>{
   const days=[]; for(let i=0;i<7;i++) if(d['s'+i]&&d['e'+i]) days.push({weekday:i,start_time:d['s'+i],end_time:d['e'+i],slot_minutes:Number(d.slot)});
   await api('/api/admin/doctors/'+encodeURIComponent(doc.id)+'/schedule',{method:'PUT',body:JSON.stringify({days})});
   await refreshAfterMutation('Schedule saved');
  });
  $('#dlgForm [name=slot]').value=String(doc.slot_minutes||30);
 },
async book(){
  const {doctors,reasons}=await appointmentOptions(), today=new Date().toISOString().slice(0,10);
  const level=(reasonId,specialty)=>{
   const reason=reasons.find(item=>item.id===reasonId); if(!reason) return '';
   if(!reason.specialties.length) return 'ok';
   const index=reason.specialties.findIndex(item=>item.toLowerCase()===String(specialty||'').trim().toLowerCase());
   return index===0?'best':index>0?'ok':'other';
  };
  const tag={best:' ★ Best match',ok:' · Suitable',other:' · Other specialty'}, order={best:0,ok:1,other:2,'':3};
  const doctorOptions=reasonId=>'<option value="">Choose a doctor</option>'+doctors.map(d=>({d,l:level(reasonId,d.specialty)}))
   .sort((x,y)=>order[x.l]-order[y.l]||x.d.name.localeCompare(y.d.name))
   .map(({d,l})=>`<option value="${esc(d.name)}">${esc(d.name)}${d.specialty?' · '+esc(d.specialty):''}${tag[l]||''}</option>`).join('');
  dialog(`<h2>Book appointment</h2><label>Patient</label><select name="pid" required>${opts(patients.map(p=>({v:p.id,t:`${p.name} · ${p.mrn||p.id}`})))}</select>
   <label>Reason for visit</label><select name="reason" id="appointment-reason" required><option value="">Choose the reason</option>${opts(reasons.map(r=>({v:r.id,t:r.label})))}</select>
   <label>Doctor</label><select name="doc" id="appointment-doctor" required><option value="">Choose the reason first</option></select><p class="form-hint" id="appointment-match"></p>
   <label>Date</label><input name="date" id="appointment-date" type="date" required min="${today}" value="${today}"><label>Available time slots</label><select name="time" id="appointment-time" required><option value="">Choose a doctor first</option></select>
   <label>Type</label><select name="type">${opts(['Consultation','Follow-up','Review','New patient'])}</select>`, async d=>{
   await api('/api/appointments',{method:'POST',body:JSON.stringify({patient_id:d.pid,doctor:d.doc,date:d.date,time:d.time,type:d.type,reason:d.reason})});
   toast('Appointment booked');
   try{await refreshData();render();}
   catch(error){toast('Appointment booked, but the schedule could not be refreshed: '+error.message);}
  });
  const hint=()=>{
   const doctor=doctors.find(item=>item.name===$('#appointment-doctor').value), l=doctor?level($('#appointment-reason').value,doctor.specialty):'';
   $('#appointment-match').textContent=l==='best'?'Best match for this reason.':l==='ok'?'This specialty can treat this reason.':l==='other'?'This doctor’s specialty does not match the reason. You may continue; the choice is recorded in the audit trail.':'';
  };
  const loadSlots=async()=>{
   const doctor=doctors.find(item=>item.name===$('#appointment-doctor').value), date=$('#appointment-date').value, select=$('#appointment-time');
   hint();
   if(!doctor||!date){select.innerHTML='<option value="">Choose a doctor first</option>';return;}
   try{
    const result=await api('/api/doctors/'+encodeURIComponent(doctor.id)+'/slots?date='+encodeURIComponent(date));
    select.innerHTML=result.slots.length?opts(result.slots):`<option value="">${esc(result.message||'No free slots on this day')}</option>`;
   }catch(error){toast(error.message);}
  };
  $('#appointment-reason').addEventListener('change',()=>{$('#appointment-doctor').innerHTML=doctorOptions($('#appointment-reason').value);$('#appointment-time').innerHTML='<option value="">Choose a doctor first</option>';hint();});
  $('#appointment-doctor').addEventListener('change',loadSlots);
  $('#appointment-date').addEventListener('change',loadSlots);
 },
 note(){
  dialog(`<h2>Clinical note (SOAP)</h2><label>ICD-10 code</label><input name="icd10_code" maxlength="16" required><label>Subjective</label><textarea name="subjective" rows="3" required></textarea><label>Objective</label><textarea name="objective" rows="3" required></textarea><label>Assessment</label><textarea name="assessment" rows="3" required></textarea><label>Plan</label><textarea name="plan" rows="3" required></textarea>`, d=>{
   return api('/api/patients/'+encodeURIComponent(state.open)+'/consultations',{method:'POST',body:JSON.stringify(d)}).then(async()=>{await refreshAfterMutation('SOAP note saved');await actions.open({dataset:{id:state.open}});}); });
 },
 rx(){
  const p = pat(state.open);
  dialog(`<h2>New prescription</h2>${p.allergies.length?`<div class="alertbar">Known allergies: ${esc(p.allergies.join(', '))}. Conflicting prescriptions will be blocked.</div>`:''}
   <label>Medicine</label><select name="medication_id" required>${opts(medications.map(med=>({v:String(med.id),t:med.name})))}</select><label>Dosage and duration</label><input name="dose" maxlength="240" required>`, d=>{
   return api('/api/patients/'+encodeURIComponent(state.open)+'/prescriptions',{method:'POST',body:JSON.stringify({medication_id:Number(d.medication_id),dose:d.dose})}).then(async()=>{await refreshAfterMutation('Prescription saved');await actions.open({dataset:{id:state.open}});});
  });
 }
};

/* ---------- Shell ---------- */
function render(){
  if(!allowed().some(n=>n.id===state.view)) state.view = allowed()[0].id;
  $('#nav').innerHTML = allowed().map(n=>`<button data-act="nav" data-id="${n.id}" ${n.id===state.view?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ico[n.icon]}</svg>${n.label}</button>`).join('');
  const v = views[state.view]();
  $('#title').textContent = v.title; $('#sub').textContent = v.sub; $('#actions').innerHTML = v.actions; $('#view').innerHTML = v.html;
  const s = $('#search'); if(s){ s.oninput = () => { state.q=s.value; const pos=s.selectionStart; render(); const n=$('#search'); n.focus(); n.setSelectionRange(pos,pos); }; }
  renderPanel();
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if(!el) return;
  if(el.dataset.act==='nav'){ state.view=el.dataset.id; state.open=null; return render(); }
  if(actions[el.dataset.act]) Promise.resolve(actions[el.dataset.act](el)).catch(error=>toast(error.message));
});
document.addEventListener('keydown', e => { if(e.key==='Enter' && e.target.matches('tr[data-act]')) e.target.click(); if(e.key==='Escape') actions.close(); });
$('#loginForm').addEventListener('submit',login);
for(const eventName of ['pointerdown','keydown','touchstart']) document.addEventListener(eventName,()=>resetIdleTimeout(),{passive:true});
$('#logout').addEventListener('click',logout);
if(state.token){ enterWorkspace(); } else { $('#app-shell').hidden=true; }
