import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '../../../../generated/prisma/client';
import { AuditService } from '../../../audit/audit.service';
import type { RequestMetadata } from '../../../common/request-metadata';
import { NotificationsService } from '../../../notifications/notifications.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { validateNeoTrioFileMetadata } from '../file-metadata';
import type {
  ApproveCharacterAssetDto,
  CreateCharacterAssetDto,
  UpdateCharacterDto,
} from '../dto/neotrio.dto';

const user = { id: true, firstName: true, lastName: true } as const;

@Injectable()
export class CharactersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.neoTrioCharacter.findMany({
      include: {
        assets: {
          where: { status: 'APPROVED' },
          orderBy: [{ isMasterAsset: 'desc' }, { createdAt: 'desc' }],
          take: 12,
          include: {
            uploadedBy: { select: user },
            approvedBy: { select: user },
          },
        },
        _count: { select: { assets: true, ideas: true, productions: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const character = await this.prisma.neoTrioCharacter.findUnique({
      where: { id },
      include: {
        createdBy: { select: user },
        updatedBy: { select: user },
        assets: {
          include: {
            uploadedBy: { select: user },
            approvedBy: { select: user },
          },
          orderBy: [{ versionGroupKey: 'asc' }, { version: 'desc' }],
        },
      },
    });
    if (!character) throw new NotFoundException('NeoTrio character not found.');
    return {
      ...character,
      configured: {
        personality: Boolean(character.personality),
        appearance: Boolean(character.appearanceGuidelines),
        voiceStyle: Boolean(character.voiceStyleGuidelines),
        general: Boolean(character.generalGuidelines),
      },
      officialAssets: character.assets.filter(
        (asset) => asset.status === 'APPROVED',
      ),
    };
  }

  async update(
    id: string,
    dto: UpdateCharacterDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const current = await this.requireCharacter(id);
    const updated = await this.prisma.neoTrioCharacter.update({
      where: { id },
      data: { ...dto, updatedById: actorId },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioCharacter',
      entityId: id,
      action: 'NEOTRIO_CHARACTER_UPDATED',
      oldValues: guidelineSnapshot(current),
      newValues: guidelineSnapshot(updated),
      requestMetadata: meta,
    });
    return updated;
  }

  async assets(characterId: string) {
    await this.requireCharacter(characterId);
    const history = await this.prisma.neoTrioCharacterAsset.findMany({
      where: { characterId },
      include: { uploadedBy: { select: user }, approvedBy: { select: user } },
      orderBy: [
        { assetType: 'asc' },
        { versionGroupKey: 'asc' },
        { version: 'desc' },
      ],
    });
    return {
      official: history.filter((asset) => asset.status === 'APPROVED'),
      history,
    };
  }

  async createAsset(
    characterId: string,
    dto: CreateCharacterAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    await this.requireCharacter(characterId);
    const file = validateNeoTrioFileMetadata(dto);
    let versionGroupKey: string = randomUUID(),
      version = 1;
    if (dto.previousAssetId) {
      const previous = await this.prisma.neoTrioCharacterAsset.findUnique({
        where: { id: dto.previousAssetId },
      });
      if (!previous || previous.characterId !== characterId)
        throw new NotFoundException(
          'Previous character asset version not found.',
        );
      versionGroupKey = previous.versionGroupKey;
      const latest = await this.prisma.neoTrioCharacterAsset.aggregate({
        where: { versionGroupKey },
        _max: { version: true },
      });
      version = (latest._max.version ?? 0) + 1;
    }
    const created = await this.prisma.neoTrioCharacterAsset.create({
      data: {
        characterId,
        versionGroupKey,
        version,
        assetType: dto.assetType,
        title: dto.title,
        description: dto.description,
        fileName: file.fileName,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        uploadedById: actorId,
      },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioCharacterAsset',
      entityId: created.id,
      action: 'NEOTRIO_CHARACTER_ASSET_UPLOADED',
      newValues: {
        characterId,
        assetType: created.assetType,
        title: created.title,
        version: created.version,
        fileName: created.fileName,
      },
      requestMetadata: meta,
    });
    return created;
  }

  async submit(assetId: string, actorId: string, meta?: RequestMetadata) {
    const asset = await this.requireAsset(assetId);
    if (asset.status !== 'DRAFT')
      throw new ConflictException('Only a DRAFT asset can be submitted.');
    const updated = await this.prisma.neoTrioCharacterAsset.update({
      where: { id: assetId },
      data: { status: 'PENDING_APPROVAL' },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioCharacterAsset',
      entityId: assetId,
      action: 'NEOTRIO_CHARACTER_ASSET_SUBMITTED',
      oldValues: { status: asset.status },
      newValues: { status: updated.status, version: updated.version },
      requestMetadata: meta,
    });
    await this.notifyPermission(
      'marketing.neotrio.asset.approve',
      NotificationType.NEOTRIO_CHARACTER_ASSET_APPROVAL_REQUIRED,
      'NeoTrio character asset approval required',
      `${asset.title} V${asset.version} requires approval.`,
      assetId,
    );
    return updated;
  }

  async approve(
    assetId: string,
    dto: ApproveCharacterAssetDto,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const asset = await this.requireAsset(assetId);
    if (asset.status !== 'PENDING_APPROVAL')
      throw new ConflictException('Only a pending asset can be approved.');
    return this.prisma.$transaction(async (tx) => {
      await tx.neoTrioCharacterAsset.updateMany({
        where: {
          versionGroupKey: asset.versionGroupKey,
          status: 'APPROVED',
          id: { not: asset.id },
        },
        data: { status: 'ARCHIVED', isMasterAsset: false },
      });
      if (dto.isMasterAsset)
        await tx.neoTrioCharacterAsset.updateMany({
          where: {
            characterId: asset.characterId,
            isMasterAsset: true,
            id: { not: asset.id },
          },
          data: { isMasterAsset: false },
        });
      const updated = await tx.neoTrioCharacterAsset.update({
        where: { id: assetId },
        data: {
          status: 'APPROVED',
          isMasterAsset: dto.isMasterAsset,
          approvedById: actorId,
          approvedAt: new Date(),
        },
      });
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'NeoTrioCharacterAsset',
          entityId: assetId,
          action: 'NEOTRIO_CHARACTER_ASSET_APPROVED',
          oldValues: {
            status: asset.status,
            isMasterAsset: asset.isMasterAsset,
          },
          newValues: {
            status: updated.status,
            isMasterAsset: updated.isMasterAsset,
            version: updated.version,
            characterId: updated.characterId,
          },
          requestMetadata: meta,
        },
        tx,
      );
      return updated;
    });
  }

  async archive(assetId: string, actorId: string, meta?: RequestMetadata) {
    const asset = await this.requireAsset(assetId);
    if (asset.status === 'ARCHIVED') return asset;
    const updated = await this.prisma.neoTrioCharacterAsset.update({
      where: { id: assetId },
      data: { status: 'ARCHIVED', isMasterAsset: false },
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'NeoTrioCharacterAsset',
      entityId: assetId,
      action: 'NEOTRIO_CHARACTER_ASSET_ARCHIVED',
      oldValues: { status: asset.status, isMasterAsset: asset.isMasterAsset },
      newValues: { status: updated.status, isMasterAsset: false },
      requestMetadata: meta,
    });
    return updated;
  }

  private requireCharacter(id: string) {
    return this.prisma.neoTrioCharacter
      .findUnique({ where: { id } })
      .then((value) => {
        if (!value) throw new NotFoundException('NeoTrio character not found.');
        return value;
      });
  }
  private requireAsset(id: string) {
    return this.prisma.neoTrioCharacterAsset
      .findUnique({ where: { id } })
      .then((value) => {
        if (!value)
          throw new NotFoundException('NeoTrio character asset not found.');
        return value;
      });
  }
  private async notifyPermission(
    permission: string,
    type: NotificationType,
    title: string,
    message: string,
    entityId: string,
  ) {
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              permissions: { some: { permission: { code: permission } } },
            },
          },
        },
      },
      select: { id: true },
    });
    await Promise.all(
      recipients.map(async ({ id }) => {
        const exists = await this.prisma.notification.findFirst({
          where: {
            userId: id,
            type,
            entityType: 'NeoTrioCharacterAsset',
            entityId,
            isRead: false,
          },
        });
        if (!exists)
          await this.notifications.create({
            userId: id,
            type,
            title,
            message,
            entityType: 'NeoTrioCharacterAsset',
            entityId,
          });
      }),
    );
  }
}

function guidelineSnapshot(value: {
  shortDescription: string | null;
  personality: string | null;
  appearanceGuidelines: string | null;
  voiceStyleGuidelines: string | null;
  generalGuidelines: string | null;
  isActive: boolean;
}): Prisma.InputJsonObject {
  return {
    shortDescription: value.shortDescription,
    personality: value.personality,
    appearanceGuidelines: value.appearanceGuidelines,
    voiceStyleGuidelines: value.voiceStyleGuidelines,
    generalGuidelines: value.generalGuidelines,
    isActive: value.isActive,
  };
}
