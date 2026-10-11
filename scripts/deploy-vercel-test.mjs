// Credentials arrive only through stdin; never save or log them.
import {Sandbox} from '@vercel/sandbox';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let credential;
try {
 let stdin='';for await(const chunk of process.stdin)stdin+=chunk;
 credential=JSON.parse(stdin);stdin='';
 if(credential.stop){const old=await Sandbox.get({name:credential.stop,token:credential.token,teamId:credential.teamId,projectId:credential.projectId});await old.stop();console.log(JSON.stringify({stage:'stopped',name:credential.stop}));process.exit(0);}
 const sandbox=credential.existing ? await Sandbox.get({name:credential.existing,token:credential.token,teamId:credential.teamId,projectId:credential.projectId}) : await Sandbox.create({name:credential.name||'kart-rush-test',token:credential.token,teamId:credential.teamId,projectId:credential.projectId,ports:[3000],runtime:'node24',region:credential.region||'bom1',timeout:45*60*1000,resources:{vcpus:1},persistent:false});
 const url=sandbox.domain(3000);
 console.log(JSON.stringify({stage:'created',name:sandbox.name,url,expiresAt:sandbox.expiresAt}));
 const files=[];
 async function collect(dir){for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+entry.name;if(entry.isDirectory())await collect(name);else files.push({path:'/vercel/sandbox/'+name,content:await fs.readFile(path.join(root,name))});}}
 await collect('dist');
 files.push({path:'/vercel/sandbox/build/server.mjs',content:await fs.readFile(path.join(root,'build/server.mjs'))});
 files.push({path:'/vercel/sandbox/package.json',content:Buffer.from(JSON.stringify({name:'kart-rush-test',private:true,type:'module',dependencies:{ws:'8.22.0',zod:'4.6.5'}}))});
 await sandbox.writeFiles(files);
 const install=await sandbox.runCommand({cmd:'npm',args:['install','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],cwd:'/vercel/sandbox'});
 if(install.exitCode!==0)throw new Error('Remote dependency installation failed: '+await install.stderr());
 if(credential.commandId){const previous=await sandbox.getCommand(credential.commandId);await previous.kill('SIGKILL');}
 const command=await sandbox.runCommand({cmd:'node',args:['build/server.mjs'],cwd:'/vercel/sandbox',env:{MODE:'online',PUBLIC_ORIGIN:credential.origin||url,PORT:'3000',NODE_ENV:'production'},detached:true});
 let health;for(let i=0;i<40;i++){try{const res=await fetch(url+'/health');if(res.ok){health=await res.json();break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!health)throw new Error('Remote game server did not become healthy.');
 const result={stage:'ready',name:sandbox.name,url,expiresAt:sandbox.expiresAt,commandId:command.cmdId,projectId:credential.projectId,health};
 await fs.writeFile(path.join(root,'docs','test-deployment.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 credential.token=undefined;
}catch(e){const message=String(e?.message||e).split(credential?.token||'unmatchable-secret').join('[redacted]');console.error(JSON.stringify({stage:'failed',message}));process.exitCode=1;}
