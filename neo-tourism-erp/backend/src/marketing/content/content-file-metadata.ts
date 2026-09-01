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

export function validateCreativeFileMetadata(value: {
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  storageKey?: string;
}) {
  const hasFile = Boolean(
    value.fileName || value.fileType || value.fileSize || value.storageKey,
  );
  if (!hasFile) return;
  if (
    !value.fileName ||
    !value.fileType ||
    !value.fileSize ||
    !value.storageKey
  )
    throw new BadRequestException(
      'File name, verified MIME type, file size, and private storage key are required together.',
    );
  const maximum = Math.max(
    1,
    Number(process.env.MARKETING_MAX_CREATIVE_BYTES ?? 250 * 1024 * 1024),
  );
  if (value.fileSize > maximum)
    throw new BadRequestException(`File exceeds the ${maximum} byte limit.`);
  if (!allowedMimeTypes.has(value.fileType.toLowerCase()))
    throw new BadRequestException('Unsupported creative MIME type.');
  if (
    value.fileName.includes('/') ||
    value.fileName.includes('\\') ||
    value.fileName.includes('..')
  )
    throw new BadRequestException('Filename must not contain a path.');
  if (
    value.storageKey.startsWith('/') ||
    value.storageKey.includes('..') ||
    !['creative/', 'marketing/'].some((prefix) =>
      value.storageKey!.startsWith(prefix),
    )
  )
    throw new BadRequestException(
      'Storage key must use the private creative/ or marketing/ namespace.',
    );
}
