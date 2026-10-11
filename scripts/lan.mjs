import {spawn} from 'node:child_process';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'build/server.mjs'))||!fs.existsSync(path.join(root,'dist/index.html'))){console.error('Build first with pnpm install and pnpm build while internet is available.');process.exit(1);}
console.log('LAN host: keep this terminal open. Phones must share your Wi-Fi/hotspot. Allow TCP '+(process.env.PORT||3000)+' on private networks. No internet needed for built assets.');
const child=spawn(process.execPath,['--env-file-if-exists=.env','build/server.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,MODE:'lan',PUBLIC_ORIGIN:''}});child.on('exit',code=>process.exit(code||0));process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
