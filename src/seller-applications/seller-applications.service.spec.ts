import { ConflictException } from '@nestjs/common';
import { Pool } from 'pg';
import { Auth0ProfileService } from './auth0-profile.service';
import { SubmitSellerApplicationDto } from './dto/submit-seller-application.dto';
import { SellerApplicationsService } from './seller-applications.service';

describe('SellerApplicationsService', () => {
  const input: SubmitSellerApplicationDto = {
    applicantName: '  Morgan Seller  ',
    shopName: '  North Star Goods  ',
    description: '  Handmade stationery and gifts.  ',
  };
  const row = {
    id: 'application-id',
    applicant_name: 'Morgan Seller',
    applicant_email: 'morgan@example.com',
    shop_name: 'North Star Goods',
    description: 'Handmade stationery and gifts.',
    status: 'pending' as const,
    submitted_at: new Date('2026-10-22T00:00:00.000Z'),
  };

  it('returns only the application belonging to the authenticated subject', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [row] }),
    } as unknown as Pool;
    const profile = { getVerifiedEmail: jest.fn() } as unknown as Auth0ProfileService;
    const service = new SellerApplicationsService(pool, profile);

    await expect(service.getForApplicant('auth0|seller-123')).resolves.toEqual({
      application: {
        id: 'application-id',
        applicantName: 'Morgan Seller',
        email: 'morgan@example.com',
        shopName: 'North Star Goods',
        description: 'Handmade stationery and gifts.',
        status: 'pending',
        submittedAt: '2026-10-22T00:00:00.000Z',
      },
    });
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE applicant_sub = $1'),
      ['auth0|seller-123'],
    );
  });

  it('stores the verified Auth0 email and ignores any client-supplied email', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [row] }),
    } as unknown as Pool;
    const profile = {
      getVerifiedEmail: jest.fn().mockResolvedValue('morgan@example.com'),
    } as unknown as Auth0ProfileService;
    const service = new SellerApplicationsService(pool, profile);

    await service.submit('auth0|seller-123', 'access-token', input);

    expect(profile.getVerifiedEmail).toHaveBeenCalledWith(
      'access-token',
      'auth0|seller-123',
    );
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO seller_applications'),
      [
        'auth0|seller-123',
        'Morgan Seller',
        'morgan@example.com',
        'North Star Goods',
        'Handmade stationery and gifts.',
      ],
    );
  });

  it('rejects a second application for the same Auth0 subject', async () => {
    const pool = {
      query: jest.fn().mockRejectedValue({ code: '23505' }),
    } as unknown as Pool;
    const profile = {
      getVerifiedEmail: jest.fn().mockResolvedValue('morgan@example.com'),
    } as unknown as Auth0ProfileService;
    const service = new SellerApplicationsService(pool, profile);

    await expect(service.submit('auth0|seller-123', 'access-token', input))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
