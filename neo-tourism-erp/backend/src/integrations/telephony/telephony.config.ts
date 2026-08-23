export function telephonyConfigured() {
  return Boolean(
    process.env.PBX_API_URL?.trim() && process.env.PBX_API_TOKEN?.trim(),
  );
}
