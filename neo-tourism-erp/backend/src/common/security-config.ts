const insecureSecretPattern = /replace|change|example|development|test|secret/i;

export function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.APP_ENV === 'production'
  );
}

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) throw new Error('JWT_SECRET is not configured.');
  if (
    isProduction() &&
    (Buffer.byteLength(secret, 'utf8') < 32 ||
      insecureSecretPattern.test(secret))
  ) {
    throw new Error('JWT_SECRET is not secure enough for production.');
  }

  return secret;
}

export function allowedOrigins(): string[] {
  const origins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (
    isProduction() &&
    (!process.env.FRONTEND_URL ||
      origins.length === 0 ||
      origins.some(
        (origin) => origin === '*' || !origin.startsWith('https://'),
      ))
  ) {
    throw new Error(
      'FRONTEND_URL must contain explicit HTTPS origins in production.',
    );
  }

  return origins;
}

export function validateProductionSecurityConfig(): void {
  jwtSecret();
  allowedOrigins();

  if (!isProduction()) return;
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is not configured.');
  }
  if (process.env.META_MOCK_ENABLED === 'true') {
    throw new Error('META_MOCK_ENABLED cannot be enabled in production.');
  }
}
