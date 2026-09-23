// Which Supabase project a run talks to; the wrapper's guard is repeated so a bare `k6 run` cannot reach production either.
const LOCAL_HOSTS = ['127.0.0.1', 'localhost'];

function required(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(
      `${name} is not set -- run through: npm run load -- <flow>`,
    );
  }
  return value;
}

function hostOf(url) {
  const match = /^https?:\/\/([^/:]+)/.exec(url);
  if (!match) throw new Error(`LOAD_SUPABASE_URL is not a URL: ${url}`);
  return match[1];
}

export const SUPABASE_URL = required('LOAD_SUPABASE_URL').replace(/\/$/, '');
export const ANON_KEY = required('LOAD_SUPABASE_ANON_KEY');
export const TARGET = required('LOAD_TARGET');

if (!['local-stack', 'hosted'].includes(TARGET)) {
  throw new Error(`LOAD_TARGET must be local-stack or hosted, not ${TARGET}`);
}
if (TARGET === 'local-stack' && !LOCAL_HOSTS.includes(hostOf(SUPABASE_URL))) {
  throw new Error(
    `LOAD_TARGET=local-stack but ${SUPABASE_URL} is not a local address`,
  );
}
if (TARGET === 'hosted' && __ENV.LOAD_CONFIRM_PRODUCTION !== 'true') {
  throw new Error(
    'LOAD_TARGET=hosted loads the production project; set LOAD_CONFIRM_PRODUCTION=true to mean it',
  );
}
