const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const db = require('../db');

const sourcePath = process.env.SQLITE_PATH || path.join(__dirname,'..','acms.db');
const tables = ['patients','users','appointments','consultations','prescriptions','invoices','stock','audit_log'];
const demoEmails = new Set(['admin@acms.local','okello@acms.local','rita@acms.local','grace@acms.local']);
const parseJson = value => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
};

async function migrate(){
  const source = new DatabaseSync(sourcePath, {readOnly:true});
  try{
    await db.initialize({seed:false});
    const sourceTables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    const patientColumns = new Set(sourceTables.has('patients')?source.prepare('PRAGMA table_info(patients)').all().map(row=>row.name):[]);
    const sourceRows = table => sourceTables.has(table)?source.prepare(`SELECT * FROM ${table}`).all():[];
    const originalUsers=sourceRows('users');
    const users=originalUsers.filter(row=>!demoEmails.has(String(row.email).toLowerCase())).map(row=>({
      id:row.id,name:row.name,email:row.email,password_hash:row.password_hash,role:row.role,active:Boolean(row.active),
      failed_attempts:row.failed_attempts,locked_until:row.locked_until,patient_id:row.patient_id,specialty:row.specialty||null
    }));
    const migratedUserIds=new Set(users.map(row=>row.id));
    const payload={
      patients:sourceRows('patients').map(row=>({
        id:row.id,name:row.name,age:row.age,date_of_birth:patientColumns.has('date_of_birth')?row.date_of_birth:null,
        sex:row.sex,phone:row.phone,next_of_kin:row.next_of_kin,allergies:parseJson(row.allergies),
        conditions:parseJson(row.conditions),created_at:row.created_at
      })),
      users,
      appointments:sourceRows('appointments').map(row=>({
        id:row.id,patient_id:row.patient_id,doctor:row.doctor,date:row.date,time:row.time,type:row.type,status:row.status
      })),
      consultations:sourceRows('consultations').map(row=>({
        id:row.id,patient_id:row.patient_id,doctor:row.doctor,date:row.date,diagnosis:row.diagnosis,notes:row.notes
      })),
      prescriptions:sourceRows('prescriptions').map(row=>({
        id:row.id,patient_id:row.patient_id,drug:row.drug,dose:row.dose,doctor:row.doctor,date:row.date
      })),
      invoices:sourceRows('invoices').map(row=>({
        id:row.id,patient_id:row.patient_id,items:row.items,amount:row.amount,paid:Boolean(row.paid),method:row.method,paid_at:row.paid_at
      })),
      stock:sourceRows('stock').map(row=>({
        id:row.id,item:row.item,qty:row.qty,reorder_level:row.reorder_level,expiry:row.expiry,supplier:row.supplier
      })),
      audit_log:sourceRows('audit_log').map(row=>({
        id:row.id,user_id:migratedUserIds.has(row.user_id)?row.user_id:null,action:row.action,detail:row.detail,at:row.at
      }))
    };
    await db.result(db.client.rpc('app_import_sqlite_data',{p_data:payload}));
    console.log(`Imported SQLite data from ${sourcePath} into Supabase. Skipped ${originalUsers.length-users.length} bundled demo account(s).`);
  }finally{
    source.close();
  }
}

migrate().catch(error=>{
  console.error('SQLite import failed:',error.message);
  process.exitCode=1;
});
