// A PostgREST builder holds its URL and only hits the network when awaited.
type PostgrestRequest = {
  url: URL;
  method: string;
  headers: Headers;
  body?: unknown;
  signal?: AbortSignal;
};

export function requestOf(builder: unknown): PostgrestRequest {
  return builder as PostgrestRequest;
}

export function paramsOf(builder: unknown): URLSearchParams {
  return requestOf(builder).url.searchParams;
}
