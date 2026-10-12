// Deployment credential is accepted on stdin only, never persisted.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
let credential;
try{
 let stdin='';for await(const chunk of process.stdin)stdin+=chunk;credential=JSON.parse(stdin);stdin='';
 const files=[];async function collect(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())await collect(file);else files.push({file,data:(await fs.readFile(file)).toString('base64'),encoding:'base64'});}}
 for(const dir of ['src','api','public','tests'])await collect(dir);
 for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','vite.config.ts','index.html','vercel.json'])files.push({file,data:(await fs.readFile(file)).toString('base64'),encoding:'base64'});
 // Upload larger bundles as individual content-addressed files; the deployment
 // JSON has a 10 MB request limit even when individual assets are much smaller.
 if(Buffer.byteLength(JSON.stringify(files))>8*1024*1024){
  for(let offset=0;offset<files.length;offset+=4)await Promise.all(files.slice(offset,offset+4).map(async file=>{
   const body=Buffer.from(file.data,'base64');const sha=createHash('sha1').update(body).digest('hex');
   const upload=await fetch('https://api.vercel.com/v2/files?teamId='+credential.teamId,{method:'POST',headers:{Authorization:'Bearer '+credential.token,'Content-Type':'application/octet-stream','Content-Length':String(body.length),'x-vercel-digest':sha},body});
   if(!upload.ok)throw new Error('File upload failed '+file.file+': '+upload.status);
   delete file.data;delete file.encoding;file.sha=sha;file.size=body.length;
  }));
 }
 const response=await fetch('https://api.vercel.com/v13/deployments?teamId='+credential.teamId,{method:'POST',headers:{Authorization:'Bearer '+credential.token,'Content-Type':'application/json'},body:JSON.stringify({name:'kart-rush-arena',project:credential.projectId,target:'production',files,projectSettings:{framework:'vite',buildCommand:'pnpm build',outputDirectory:'dist',installCommand:'pnpm install --frozen-lockfile',nodeVersion:'24.x'}})});const deployment=await response.json();if(!response.ok)throw new Error(deployment.error?.message||'Deployment rejected');console.log(JSON.stringify({id:deployment.id,url:deployment.url,state:deployment.readyState}));
 for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,2000));const res=await fetch('https://api.vercel.com/v13/deployments/'+deployment.id+'?teamId='+credential.teamId,{headers:{Authorization:'Bearer '+credential.token}});const state=await res.json();if(state.readyState==='READY'){console.log(JSON.stringify({id:deployment.id,state:'READY',alias:state.alias}));credential.token=undefined;process.exit(0);}if(state.readyState==='ERROR'||state.readyState==='CANCELED')throw new Error(state.errorMessage||state.readyState);}throw new Error('Deployment polling timed out');
}catch(e){console.error(String(e?.message||e).split(credential?.token||'unmatchable-secret').join('[redacted]'));process.exitCode=1;}
