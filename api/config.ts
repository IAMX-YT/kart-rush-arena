import type {IncomingMessage, ServerResponse} from 'node:http';
export default function handler(_request:IncomingMessage, response:ServerResponse) {
  response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({mode:'online',origin:'https://rushroom-games.vercel.app',lan:[]}));
}
