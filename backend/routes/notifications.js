const express=require("express");
const router=express.Router();
const supabaseAdmin=require("../supabaseAdmin");
const{requireAuth}=require("../middleware/auth");
const{requireOrg}=require("../middleware/orgGuard");
router.use(requireAuth);router.use(requireOrg);

router.get("/",async(req,res)=>{try{
  const orgCode=req.orgCode||req.org_code;
  const{data,error}=await supabaseAdmin.from("app_notifications").select("id,type,title,message,action_path,metadata,read_at,created_at,department_id").eq("org_code",orgCode).eq("user_id",req.userId).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;res.json(data||[]);
}catch(e){console.error("NOTIFICATIONS GET ERROR",e);res.status(500).json({error:"Unable to load notifications"})}});

router.get("/unread-count",async(req,res)=>{try{
  const{count,error}=await supabaseAdmin.from("app_notifications").select("id",{count:"exact",head:true}).eq("org_code",req.orgCode||req.org_code).eq("user_id",req.userId).is("read_at",null);
  if(error)throw error;res.json({count:count||0});
}catch(e){console.error("NOTIFICATION COUNT ERROR",e);res.status(500).json({error:"Unable to load notification count"})}});

router.patch("/:id/read",async(req,res)=>{try{
  const{data,error}=await supabaseAdmin.from("app_notifications").update({read_at:new Date().toISOString()}).eq("id",req.params.id).eq("org_code",req.orgCode||req.org_code).eq("user_id",req.userId).select("id,read_at").maybeSingle();
  if(error)throw error;if(!data)return res.status(404).json({error:"Notification not found"});res.json(data);
}catch(e){console.error("NOTIFICATION READ ERROR",e);res.status(500).json({error:"Unable to mark notification read"})}});

router.patch("/read-all",async(req,res)=>{try{
  const{error}=await supabaseAdmin.from("app_notifications").update({read_at:new Date().toISOString()}).eq("org_code",req.orgCode||req.org_code).eq("user_id",req.userId).is("read_at",null);
  if(error)throw error;res.json({success:true});
}catch(e){console.error("NOTIFICATION READ ALL ERROR",e);res.status(500).json({error:"Unable to mark notifications read"})}});

module.exports=router;
