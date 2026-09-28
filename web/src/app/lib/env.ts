export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name} -- copy web/.env.example to web/.env.local and fill it in (see CONTRIBUTING.md's "Local development" section).`,
    );
  }
  return value;
}

export function basePath(): string {
  // Read as a literal `process.env.X` expression, the only form Next's static export inlines.
  return process.env.NEXT_PUBLIC_BASE_PATH ?? '';
}

export function withBasePath(path: `/${string}`): string {
  return `${basePath()}${path}`;
}
