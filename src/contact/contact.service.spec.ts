import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { createTransport } from 'nodemailer';
import { ContactService } from './contact.service';
import { SubmitContactRequestDto } from './dto/submit-contact-request.dto';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('ContactService', () => {
  const config = {
    host: 'smtp.example.test',
    port: 587,
    secure: false,
    user: 'mailer',
    password: 'not-a-real-secret',
    from: 'noreply@example.test',
    to: 'support@example.test',
    retentionDays: 30,
  };
  const request: SubmitContactRequestDto = {
    name: 'Morgan Example',
    email: 'morgan@example.test',
    category: 'general',
    subject: 'A question',
    message: 'I have a question about the local demonstration.',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves a ticket before sending and returns the actual SMTP outcome', async () => {
    const sendMail = jest.fn().mockResolvedValue({ accepted: ['support@example.test'] });
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const configService = {
      get: jest.fn().mockReturnValue(config),
    } as unknown as ConfigService;
    const service = new ContactService(pool, configService);

    const result = await service.submit(request, '127.0.0.1');

    expect(result.ticketReference).toMatch(/^SUP-[A-F0-9]{12}$/);
    expect(result.notificationSent).toBe(true);
    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO support_tickets'),
      [
        result.ticketReference,
        request.name,
        request.email,
        request.category,
        request.subject,
        request.message,
        config.retentionDays,
      ],
    );
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: config.to,
      replyTo: request.email,
      text: expect.stringContaining(request.message),
    }));
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE support_tickets'),
      [result.ticketReference, true],
    );
  });

  it('reports a saved ticket without claiming a failed email notification was sent', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP unavailable'));
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const configService = {
      get: jest.fn().mockReturnValue(config),
    } as unknown as ConfigService;
    const service = new ContactService(pool, configService);

    await expect(service.submit(request, '127.0.0.1')).resolves.toMatchObject({
      notificationSent: false,
    });
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE support_tickets'),
      [expect.stringMatching(/^SUP-[A-F0-9]{12}$/), false],
    );
  });

  it('does not claim notification success when SMTP accepts no recipients', async () => {
    const sendMail = jest.fn().mockResolvedValue({
      accepted: [],
      rejected: ['support@example.test'],
    });
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const configService = {
      get: jest.fn().mockReturnValue(config),
    } as unknown as ConfigService;
    const service = new ContactService(pool, configService);

    await expect(service.submit(request, '127.0.0.1')).resolves.toMatchObject({
      notificationSent: false,
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE support_tickets'),
      [expect.stringMatching(/^SUP-[A-F0-9]{12}$/), false],
    );
  });

  it('does not send a notification when durable ticket persistence fails', async () => {
    const sendMail = jest.fn().mockResolvedValue({ accepted: ['support@example.test'] });
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const pool = {
      query: jest.fn().mockRejectedValue(new Error('database failure')),
    } as unknown as Pool;
    const configService = {
      get: jest.fn().mockReturnValue(config),
    } as unknown as ConfigService;
    const service = new ContactService(pool, configService);

    await expect(service.submit(request, '127.0.0.1')).rejects.toThrow('database failure');
    expect(sendMail).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('does not store a request when SMTP and retention configuration are absent', async () => {
    const pool = {
      query: jest.fn(),
    } as unknown as Pool;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const service = new ContactService(pool, configService);

    await expect(service.submit(request, '127.0.0.1'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(pool.query).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('limits repeated submissions from one client address', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    (createTransport as jest.Mock).mockReturnValue({ sendMail, close: jest.fn() });
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Pool;
    const configService = {
      get: jest.fn().mockReturnValue(config),
    } as unknown as ConfigService;
    const service = new ContactService(pool, configService);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.submit(request, '127.0.0.1');
    }
    const rateLimitError = await service.submit(request, '127.0.0.1')
      .then(() => null, (error: unknown) => error);
    expect(rateLimitError).toBeInstanceOf(HttpException);
    if (rateLimitError instanceof HttpException) {
      expect(rateLimitError.getStatus()).toBe(429);
    }
    expect(pool.query).toHaveBeenCalledTimes(10);
  });
});
