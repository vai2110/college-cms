
const express=require("express"),fs=require("fs"),path=require("path");
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname;
app.use(express.json({limit:"25mb"}));app.use(express.static(path.join(ROOT,"public")));
const regFile=path.join(ROOT,"data","registry.json");
const load=()=>JSON.parse(fs.readFileSync(regFile,"utf8"));
const save=x=>fs.writeFileSync(regFile,JSON.stringify(x,null,2));
const slug=s=>s.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function findPage(id){for(const c of load().colleges){const p=c.pages.find(x=>`${c.id}:${x.id}`===id);if(p)return{c,p}}return null}
app.get("/api/colleges",(q,r)=>r.json(load()));
app.post("/api/colleges",(q,r)=>{
 const d=load(),name=q.body.name?.trim();if(!name)return r.status(400).json({error:"College name required"});
 const id=slug(q.body.slug||name);if(d.colleges.some(c=>c.id===id))return r.status(409).json({error:"College already exists"});
 d.colleges.push({id,name,slug:id,pages:[]});fs.mkdirSync(path.join(ROOT,"content",id),{recursive:true});save(d);r.json({ok:true,id});
});
app.post("/api/pages",(q,r)=>{
 const d=load(),c=d.colleges.find(x=>x.id===q.body.collegeId);if(!c)return r.status(404).json({error:"College not found"});
 const type=q.body.type||"custom",pageName=q.body.name||type, id=slug(q.body.slug||pageName);
 if(c.pages.some(p=>p.id===id))return r.status(409).json({error:"Page already exists"});
 const tpl=fs.readFileSync(path.join(ROOT,"templates",`${type}.html`),"utf8");
 const html=tpl.replaceAll("{{COLLEGE_NAME}}",c.name).replaceAll("{{PAGE_NAME}}",pageName).replaceAll("{{SEO_TITLE}}",`${c.name} ${pageName}`).replaceAll("{{META_DESCRIPTION}}",`${c.name} ${pageName} information.`);
 const rel=`content/${c.id}/${id}.html`,abs=path.join(ROOT,rel);fs.mkdirSync(path.dirname(abs),{recursive:true});fs.writeFileSync(abs,html);
 const p={id,name:pageName,type,source:rel,status:"draft"};c.pages.push(p);save(d);r.json({ok:true,page:`${c.id}:${id}`});
});
app.get("/api/page/:id",(q,r)=>{
 const x=findPage(decodeURIComponent(q.params.id));if(!x)return r.status(404).json({error:"Not found"});
 r.json({college:x.c,page:x.p,html:fs.readFileSync(path.join(ROOT,x.p.source),"utf8")});
});
app.put("/api/page/:id",(q,r)=>{
 const x=findPage(decodeURIComponent(q.params.id));if(!x)return r.status(404).json({error:"Not found"});
 fs.writeFileSync(path.join(ROOT,x.p.source),q.body.html,"utf8");r.json({ok:true,savedAt:new Date().toISOString()});
});
app.post("/api/page/:id/publish",(q,r)=>{
 const x=findPage(decodeURIComponent(q.params.id));if(!x)return r.status(404).json({error:"Not found"});
 const d=load(),c=d.colleges.find(z=>z.id===x.c.id),p=c.pages.find(z=>z.id===x.p.id);p.status="live";save(d);
 r.json({ok:true,message:"Published in local CMS starter",url:`/content/${x.c.id}/${x.p.id}.html`});
});
app.use("/content",express.static(path.join(ROOT,"content")));

/* GitHub auto-sync architecture: production CMS calls GitHub API/webhook here.
   This starter accepts discovered page paths so a future sync service can register them automatically. */
app.post("/api/sync/discover",(q,r)=>{
 const items=q.body.pages||[],d=load(),added=[];
 for(const it of items){
  const cid=slug(it.collegeId||it.college||"unassigned"),cname=it.collegeName||it.college||cid;
  let c=d.colleges.find(x=>x.id===cid);if(!c){c={id:cid,name:cname,slug:cid,pages:[]};d.colleges.push(c)}
  const pid=slug(it.pageId||it.name||path.basename(it.path||"page",".html"));
  if(!c.pages.some(p=>p.id===pid)){c.pages.push({id:pid,name:it.name||pid,type:it.type||"custom",source:it.path,status:"discovered"});added.push(`${cid}:${pid}`)}
 }
 save(d);r.json({ok:true,added});
});
app.listen(PORT,()=>console.log("CollegeCMS Core http://localhost:"+PORT));
