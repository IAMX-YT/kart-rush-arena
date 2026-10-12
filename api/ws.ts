import http from 'node:http';
import {WebSocket, WebSocketServer} from 'ws';
import {backendChannel} from '../src/server/sshGateway.js';

const frontend = 'https://rushroom-games.vercel.app';
const server = http.createServer((_request, response) => {response.writeHead(426); response.end('WebSocket connection required');});
const clients = new WebSocketServer({noServer:true,maxPayload:4096});
server.on('upgrade', async (request, socket, head) => {
  if (request.headers.origin !== frontend) {socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return;}
  try {
    const stream = await backendChannel();
    const agent = new http.Agent({keepAlive:false});
    agent.createConnection = () => stream;
    const upstream = new WebSocket('ws://127.0.0.1:3210/ws', {origin:frontend,agent,maxPayload:2*1024*1024});
    upstream.once('close',()=>agent.destroy());
    socket.once('close', () => upstream.close());
    upstream.once('error', error => {console.error('Rushroom upstream:',error.message);if (!socket.destroyed) socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');});
    upstream.once('open', () => {
      if (socket.destroyed) {upstream.close();return;}
      clients.handleUpgrade(request, socket, head, downstream => {
        downstream.on('message', data => {if(upstream.readyState === WebSocket.OPEN)upstream.send(data,{binary:false});});
        upstream.on('message', data => {
          if(downstream.readyState !== WebSocket.OPEN)return;
          if(downstream.bufferedAmount > 512000){downstream.close(1013,'Connection too slow');return;}
          downstream.send(data,{binary:false});
        });
        upstream.on('close', (code, reason) => {if(downstream.readyState === WebSocket.OPEN)downstream.close(code === 1006 ? 1012 : code,reason);});
        upstream.on('error', () => downstream.close(1012,'Backend connection interrupted'));
        downstream.on('close', () => upstream.close());
        downstream.on('error', () => upstream.close());
      });
    });
  } catch (error) {console.error('Rushroom relay:',error instanceof Error ? error.message : 'failed');if (!socket.destroyed) socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');}
});
export default server;
