export interface AuditActor {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuditEntry {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: AuditActor;
}

export interface AuditListResponse {
  data: AuditEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
