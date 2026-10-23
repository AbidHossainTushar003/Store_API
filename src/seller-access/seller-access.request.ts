import type { Request } from 'express';
import type { AuthenticatedSellerRequest } from '../seller-applications/auth0-session.guard';
import type { LocalDemoRequest } from '../local-demo-auth/local-demo-auth.types';

export interface SellerAccessRequest extends Request, AuthenticatedSellerRequest, LocalDemoRequest {
  sellerAccountId?: string;
}
