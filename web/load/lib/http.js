// How every request goes out: the target's key and the caller's token, a `name` tag, a success check, and a timeout count.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

import { ANON_KEY, SUPABASE_URL } from './target.js';

// k6's error code for a request that ran into its own timeout (k6 docs, "Error codes").
const REQUEST_TIMEOUT = 1050;
const timeouts = new Counter('http_req_timeouts');

export function query(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

function prepare({ method, path, session, body = null, headers = {}, name }) {
  return {
    method,
    url: `${SUPABASE_URL}${path}`,
    body,
    params: {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${session ? session.token : ANON_KEY}`,
        ...headers,
      },
      tags: { name },
    },
  };
}

function observe(response, name) {
  if (response.error_code === REQUEST_TIMEOUT) timeouts.add(1, { name });
  check(response, {
    [`${name} succeeded`]: (checked) =>
      checked.status >= 200 && checked.status < 300,
  });
  return response;
}

export function send(request) {
  const { method, url, body, params } = prepare(request);
  return observe(http.request(method, url, body, params), request.name);
}

/** What the client sends side by side (Promise.all, a pool), sent at once; `url` alone is an unauthenticated GET. */
export function sendAll(requests) {
  const prepared = requests.map((request) =>
    request.url
      ? {
          method: 'GET',
          url: request.url,
          params: { tags: { name: request.name } },
        }
      : prepare(request),
  );
  return http
    .batch(prepared)
    .map((response, index) => observe(response, requests[index].name));
}

export function sendJson({ method, path, session, payload, prefer, name }) {
  return send({
    method,
    path,
    session,
    name,
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      Prefer: prefer ?? 'return=minimal',
    },
  });
}

/** Throws with the response body, for setup and teardown steps a run cannot continue without. */
export function expectOk(response, what) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${what} failed: HTTP ${response.status} ${response.body}`);
  }
  return response;
}
