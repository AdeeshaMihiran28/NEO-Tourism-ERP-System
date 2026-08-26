export function metaConfiguration() {
  const mock = process.env.META_MOCK_ENABLED === 'true';
  const real = Boolean(
    process.env.META_APP_ID?.trim() &&
    process.env.META_APP_SECRET?.trim() &&
    process.env.META_ACCESS_TOKEN?.trim() &&
    (process.env.META_FACEBOOK_PAGE_ID?.trim() ||
      process.env.META_INSTAGRAM_ACCOUNT_ID?.trim()),
  );
  return {
    mock,
    real,
    configured: mock || real,
    facebook: Boolean(process.env.META_FACEBOOK_PAGE_ID?.trim()) || mock,
    instagram: Boolean(process.env.META_INSTAGRAM_ACCOUNT_ID?.trim()) || mock,
  };
}
