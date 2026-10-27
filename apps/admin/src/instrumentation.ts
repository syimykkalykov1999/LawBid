/**
 * S18-4: server-side render / route errors of the admin (Next's own
 * onRequestError hook). One structured JSON line, no message text (it may
 * carry user data) and no request body — the digest ties it to the page.
 */
export function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  const e = error as { name?: string; digest?: string } | undefined;
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'admin_request_error',
      name: e?.name ?? 'Error',
      digest: e?.digest,
      method: request.method,
      path: request.path.replace(/[?#].*$/, ''),
      routePath: context.routePath,
      routeType: context.routeType,
    }),
  );
}
