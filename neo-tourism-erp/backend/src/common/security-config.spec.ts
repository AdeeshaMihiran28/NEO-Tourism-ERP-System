import {
  allowedOrigins,
  jwtSecret,
  validateProductionSecurityConfig,
} from './security-config';

describe('production security configuration', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...original,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://configured',
      JWT_SECRET: 'a-production-key-with-at-least-32-random-bytes',
      FRONTEND_URL: 'https://erp.example.com,https://uat.example.com',
      META_MOCK_ENABLED: 'false',
    };
  });

  afterAll(() => {
    process.env = original;
  });

  it('accepts explicit production origins and a strong JWT secret', () => {
    expect(allowedOrigins()).toEqual([
      'https://erp.example.com',
      'https://uat.example.com',
    ]);
    expect(jwtSecret()).toBe(process.env.JWT_SECRET);
    expect(() => validateProductionSecurityConfig()).not.toThrow();
  });

  it.each([
    ['weak JWT secret', { JWT_SECRET: 'replace-me' }],
    ['wildcard origin', { FRONTEND_URL: '*' }],
    ['insecure origin', { FRONTEND_URL: 'http://erp.example.com' }],
    ['mock integration', { META_MOCK_ENABLED: 'true' }],
  ])('rejects %s in production', (_name, environment) => {
    Object.assign(process.env, environment);
    expect(() => validateProductionSecurityConfig()).toThrow();
  });
});
