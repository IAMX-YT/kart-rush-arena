// A forced-command SSH key may bridge only to the local Rushroom service.
import net from 'node:net';
const backend=net.createConnection({host:'127.0.0.1',port:3210});
backend.setNoDelay(true);
process.stdin.pipe(backend).pipe(process.stdout);
backend.on('error',()=>{process.exitCode=1;backend.destroy();});
backend.on('close',()=>process.exit(process.exitCode||0));
process.stdin.on('error',()=>backend.destroy());
process.stdout.on('error',()=>backend.destroy());
