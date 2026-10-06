import { env } from 'cloudflare:workers';
export function progressDb(){if(!env.DB)throw new Error('Study storage is unavailable');return env.DB;}
