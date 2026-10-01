import type { DataScope } from '@prisma/client';

export interface AuthContext {
  userId: string;
  organisationId: string;
  /** The user's home organisation (differs from organisationId when a super admin switches org). */
  homeOrganisationId: string;
  roleKey: string;
  dataScope: DataScope;
  permissions: Set<string>;
  employeeId: string | null;
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: AuthContext;
    }
  }
}

export {};
