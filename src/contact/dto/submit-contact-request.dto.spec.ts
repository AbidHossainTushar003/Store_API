import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SubmitContactRequestDto } from './submit-contact-request.dto';

describe('SubmitContactRequestDto', () => {
  const validRequest = {
    name: 'Test Visitor',
    email: 'visitor@example.test',
    category: 'general',
    subject: 'A test question',
    message: 'A synthetic support request for validation tests.',
  };

  it('rejects line breaks in a subject before it is used in an email header', async () => {
    const request = plainToInstance(SubmitContactRequestDto, {
      ...validRequest,
      subject: 'Question\r\nBcc: outsider@example.test',
    });

    const errors = await validate(request);

    expect(errors.map(({ property }) => property)).toContain('subject');
  });

  it('accepts a valid synthetic support request', async () => {
    const request = plainToInstance(SubmitContactRequestDto, validRequest);

    await expect(validate(request)).resolves.toHaveLength(0);
  });
});
