import type { Request } from 'express';

export type LocalDemoRole = 'seller' | 'admin';

export interface LocalDemoIdentity {
  id: string;
  email: string;
  name: string;
  role: LocalDemoRole;
}

export interface LocalDemoRequest extends Request {
  localDemoIdentity?: LocalDemoIdentity;
}
