const express=require("express");
const supabaseAdmin=require("../supabaseAdmin");
const router=express.Router();

const ROLE_GROUPS=["Nurse","CNA"],SHIFT_TYPES=["Day","Evening","Night"];
function defaults(){const rows=[];for(const role_group of ROLE_GROUPS)for(const shift_type of SHIFT_TYPES)rows.push({role_group,shift_type,required_count:0});return rows;}

router.get("/",async(req,res)=>{try{
  const{data,error}=await supabaseAdmin.from("schedule_coverage_requirements").select("role_group,shift_type,required_count").eq("org_id",req.orgId);
  if(error)throw error;
  const map=new Map((data||[]).map(r=>[`${r.role_group}|${r.shift_type}`,r]));
  res.json(defaults().map(r=>map.get(`${r.role_group}|${r.shift_type}`)||r));
}catch(e){console.error("COVERAGE REQUIREMENTS GET ERROR",e);res.status(500).json({error:"Unable to load coverage requirements"})}});

router.put("/",async(req,res)=>{try{
  const rows=Array.isArray(req.body?.requirements)?req.body.requirements:[];
  if(!rows.length)return res.status(400).json({error:"requirements[] is required"});
  const clean=[];
  for(const r of rows){
    const role_group=String(r?.role_group||"");
    const shift_type=String(r?.shift_type||"");
    const required_count=Number(r?.required_count);
    if(!ROLE_GROUPS.includes(role_group)||!SHIFT_TYPES.includes(shift_type)||!Number.isInteger(required_count)||required_count<0||required_count>100)return res.status(400).json({error:"Invalid coverage requirement"});
    clean.push({org_id:req.orgId,role_group,shift_type,required_count,updated_at:new Date().toISOString()});
  }
  const{data,error}=await supabaseAdmin.from("schedule_coverage_requirements").upsert(clean,{onConflict:"org_id,role_group,shift_type"}).select("role_group,shift_type,required_count");
  if(error)throw error;
  res.json(data||[]);
}catch(e){console.error("COVERAGE REQUIREMENTS PUT ERROR",e);res.status(500).json({error:"Unable to save coverage requirements"})}});

module.exports=router;
