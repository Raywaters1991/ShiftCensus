const express=require("express");
const supabaseAdmin=require("../supabaseAdmin");
const {requireAuth}=require("../middleware/auth");
const {requireOrg}=require("../middleware/orgGuard");
const router=express.Router();
router.use(requireAuth);router.use(requireOrg);
router.patch("/:id/revoke",async(req,res)=>{try{const orgCode=req.orgCode||req.org_code;const{data:r,error}=await supabaseAdmin.from("shift_requests").select("id,status,end_date").eq("id",req.params.id).eq("org_code",orgCode).eq("user_id",req.userId).maybeSingle();if(error)throw error;if(!r)return res.status(404).json({error:"Request not found"});if(r.status!=="pending")return res.status(409).json({error:"Only pending requests can be revoked"});const today=new Date().toISOString().slice(0,10);if(r.end_date&&r.end_date<today)return res.status(409).json({error:"The request date has passed"});const{data,error:updateError}=await supabaseAdmin.from("shift_requests").update({status:"cancelled",decision_note:"Revoked by employee",decided_at:new Date().toISOString()}).eq("id",r.id).eq("org_code",orgCode).eq("user_id",req.userId).eq("status","pending").select().maybeSingle();if(updateError)throw updateError;if(!data)return res.status(409).json({error:"Request changed before it could be revoked"});return res.json(data)}catch(e){console.error("REQUEST REVOKE ERROR",e);return res.status(500).json({error:"Unable to revoke request"})}});
module.exports=router;
