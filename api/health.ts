import type {IncomingMessage, ServerResponse} from 'node:http';
import {backendHealth} from '../src/server/sshGateway.js';
export default async function handler(_request:IncomingMessage, response:ServerResponse) {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('Content-Type','application/json');
  try {response.end(await backendHealth());}
  catch (error) {console.error('Rushroom health relay:',error instanceof Error ? error.message : 'failed');response.statusCode=503;response.end(JSON.stringify({ok:false,message:'Multiplayer service unavailable'}));}
}
