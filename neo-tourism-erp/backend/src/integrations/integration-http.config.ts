export function integrationHttpTimeoutMs() {
  const configured = Number(process.env.INTEGRATION_HTTP_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(configured) &&
    configured >= 1_000 &&
    configured <= 30_000
    ? configured
    : 10_000;
}
