import {Client, type ClientChannel} from 'ssh2';
import http from 'node:http';

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let ready = false;
    client.once('ready', () => {ready = true; resolve(client);});
    client.on('error', error => {if (!ready) reject(error);});
    client.once('close', () => {if (!ready) reject(new Error('Backend relay closed'));});
    client.connect({
      host: process.env.RUSHROOM_SSH_HOST,
      username: process.env.RUSHROOM_SSH_USER,
      privateKey: process.env.RUSHROOM_SSH_KEY,
      hostHash: 'sha256',
      hostVerifier: (hash: string) => hash === process.env.RUSHROOM_SSH_HOST_HASH,
      readyTimeout: 10000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
    });
  });
}

export async function backendChannel(): Promise<ClientChannel> {
  const client = await connect();
  return new Promise((resolve, reject) => client.exec('rushroom-relay', (error, stream) => {
    if(error){client.end();reject(error);return;}
    stream.once('close',()=>client.end());
    resolve(stream);
  }));
}

export async function backendHealth(): Promise<string> {
  const stream = await backendChannel();
  const agent = new http.Agent({keepAlive:false});
  agent.createConnection = () => stream;
  return new Promise((resolve, reject) => {
    const request = http.request({host:'127.0.0.1',port:3210,path:'/health',agent}, response => {
      let data = '';
      response.on('data', chunk => {data += chunk;});
      response.on('end', () => {clearTimeout(timeout);agent.destroy(); stream.end(); response.statusCode === 200 ? resolve(data) : reject(new Error('Backend health unavailable'));});
    });
    const timeout = setTimeout(() => request.destroy(new Error('Backend health timed out')),8000);
    request.on('error', error => {clearTimeout(timeout);agent.destroy();stream.destroy(); reject(error);});
    request.end();
  });
}
