import { BadRequestException } from '@nestjs/common';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'audio/mpeg',
  'audio/wav',
  'application/pdf',
  'text/plain',
]);

export function validateNeoTrioFileMetadata(value: {
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
}) {
  const maximum = Math.max(
    1,
    Number(process.env.NEOTRIO_MAX_ASSET_BYTES ?? 250 * 1024 * 1024),
  );
  if (value.fileSize > maximum)
    throw new BadRequestException(`File exceeds the ${maximum} byte limit.`);
  const mimeType = value.mimeType.toLowerCase();
  if (!allowedMimeTypes.has(mimeType))
    throw new BadRequestException('Unsupported asset MIME type.');
  if (
    value.fileName.includes('/') ||
    value.fileName.includes('\\') ||
    value.fileName.includes('..')
  )
    throw new BadRequestException('Filename must not contain a path.');
  if (
    value.storageKey.startsWith('/') ||
    value.storageKey.includes('..') ||
    !value.storageKey.startsWith('neotrio/')
  )
    throw new BadRequestException(
      'Storage key must use the private neotrio/ namespace.',
    );
  return { ...value, mimeType };
}
