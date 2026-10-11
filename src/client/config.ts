const defaultRemoteOrigin = 'https://sb-33y4io3yvqam.vercel.run';
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const SERVER_ORIGIN =
  (import.meta as ImportMeta & { env: { VITE_SERVER_ORIGIN?: string } }).env.VITE_SERVER_ORIGIN ||
  (isLocalhost ? '' : defaultRemoteOrigin);

