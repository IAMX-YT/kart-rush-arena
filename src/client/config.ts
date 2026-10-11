export const SERVER_ORIGIN = (import.meta as ImportMeta & {env: {VITE_SERVER_ORIGIN?: string}}).env.VITE_SERVER_ORIGIN || '';
