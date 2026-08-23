export function wiseConfigured() {
  return Boolean(process.env.WISE_API_TOKEN?.trim());
}
