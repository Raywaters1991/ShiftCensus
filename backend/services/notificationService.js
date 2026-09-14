const supabaseAdmin=require("../supabaseAdmin");

async function createNotifications(rows){
  const clean=(rows||[]).filter(r=>r&&r.user_id&&r.org_code&&r.type&&r.title);
  if(!clean.length)return [];
  const{data,error}=await supabaseAdmin.from("app_notifications").insert(clean.map(r=>({
    org_code:r.org_code,
    user_id:r.user_id,
    department_id:r.department_id||null,
    type:r.type,
    title:r.title,
    message:r.message||null,
    action_path:r.action_path||null,
    metadata:r.metadata||{}
  }))).select("id,user_id");
  if(error)throw error;
  return data||[];
}

async function notifyDepartment({orgCode,departmentId,type,title,message,actionPath,metadata,excludeUserIds=[]}){
  let q=supabaseAdmin.from("staff").select("user_id,department_id").eq("org_code",orgCode).not("user_id","is",null);
  if(departmentId)q=q.eq("department_id",departmentId);
  const{data,error}=await q;
  if(error)throw error;
  const excluded=new Set((excludeUserIds||[]).map(String));
  const seen=new Set();
  const rows=(data||[]).filter(s=>s.user_id&&!excluded.has(String(s.user_id))&&!seen.has(String(s.user_id))&&(seen.add(String(s.user_id))||true)).map(s=>({
    org_code:orgCode,user_id:s.user_id,department_id:s.department_id||departmentId||null,type,title,message,action_path:actionPath,metadata
  }));
  return createNotifications(rows);
}

async function notifyScheduleEditors({orgId,orgCode,departmentId,type,title,message,actionPath,metadata}){
  let q=supabaseAdmin.from("org_memberships").select("user_id,department_id").eq("org_id",orgId).eq("is_active",true).eq("can_schedule_write",true);
  if(departmentId)q=q.eq("department_id",departmentId);
  const{data,error}=await q;
  if(error)throw error;
  const seen=new Set();
  const rows=(data||[]).filter(x=>x.user_id&&!seen.has(String(x.user_id))&&(seen.add(String(x.user_id))||true)).map(x=>({
    org_code:orgCode,user_id:x.user_id,department_id:x.department_id||departmentId||null,type,title,message,action_path:actionPath,metadata
  }));
  return createNotifications(rows);
}

async function notifyEligibleForShift({orgCode,shift,type,title,message,actionPath="/open-shifts",metadata,excludeUserIds=[]}){
  let q=supabaseAdmin.from("staff").select("id,user_id,role,department_id").eq("org_code",orgCode).not("user_id","is",null);
  if(shift.department_id)q=q.eq("department_id",shift.department_id);
  const{data,error}=await q;if(error)throw error;
  const isNurse=v=>["RN","LPN","NURSE"].includes(String(v||"").toUpperCase());
  const wanted=String(shift.role||"").toUpperCase();
  const excluded=new Set((excludeUserIds||[]).map(String));
  const eligible=(data||[]).filter(s=>{
    if(!s.user_id||excluded.has(String(s.user_id)))return false;
    const role=String(s.role||"").toUpperCase();
    return isNurse(wanted)?isNurse(role):role===wanted;
  });
  const seen=new Set();
  return createNotifications(eligible.filter(s=>!seen.has(String(s.user_id))&&(seen.add(String(s.user_id))||true)).map(s=>({
    org_code:orgCode,user_id:s.user_id,department_id:s.department_id||null,type,title,message,action_path:actionPath,metadata:{shift_id:shift.id,...(metadata||{})}
  })));
}

module.exports={createNotifications,notifyDepartment,notifyScheduleEditors,notifyEligibleForShift};
