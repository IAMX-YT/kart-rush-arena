const defaultRemoteOrigin = 'https://sb-2cf1zfkzsyid.vercel.run';
const isHostedFrontend =
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.vercel.app');

export const SERVER_ORIGIN =
  (import.meta as ImportMeta & { env: { VITE_SERVER_ORIGIN?: string } }).env.VITE_SERVER_ORIGIN ||
  (isHostedFrontend ? defaultRemoteOrigin : '');

