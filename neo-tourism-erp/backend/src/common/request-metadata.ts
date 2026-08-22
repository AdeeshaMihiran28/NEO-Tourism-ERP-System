import type { Request } from 'express';

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export function getRequestMetadata(request: Request): RequestMetadata {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim();
  const userAgent = request.get('user-agent')?.trim();

  return {
    ...(forwardedAddress || request.ip
      ? { ipAddress: forwardedAddress ?? request.ip }
      : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
