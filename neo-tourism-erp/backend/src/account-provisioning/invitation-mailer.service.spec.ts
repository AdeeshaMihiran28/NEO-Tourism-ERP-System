import { createTransport } from 'nodemailer';
import { InvitationMailerService } from './invitation-mailer.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('InvitationMailerService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('emails the single-use invitation when SMTP is configured', async () => {
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '587',
      SMTP_USER: 'sender@example.test',
      SMTP_PASSWORD: 'app-password',
      SMTP_FROM: 'NEO ERP <sender@example.test>',
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'sent' });
    jest
      .mocked(createTransport)
      .mockReturnValue({ sendMail } as unknown as ReturnType<
        typeof createTransport
      >);

    await expect(
      new InvitationMailerService().send({
        to: 'employee@example.test',
        firstName: 'John',
        employeeNumber: 'NEO-EMP-0001',
        loginEmail: 'employee@example.test',
        invitationLink: 'https://erp.example.test/setup-password?token=secret',
        expiresAt: new Date('2026-09-18T00:00:00.000Z'),
      }),
    ).resolves.toBe('SENT');
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'employee@example.test',
        subject: 'Your Neo Tourism ERP Account Is Ready',
      }),
    );
  });

  it('does not attempt delivery without complete SMTP credentials', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_PASS;

    await expect(
      new InvitationMailerService().send({
        to: 'employee@example.test',
        firstName: 'John',
        employeeNumber: 'NEO-EMP-0001',
        loginEmail: 'employee@example.test',
        invitationLink: 'https://erp.example.test/setup-password?token=secret',
        expiresAt: new Date('2026-09-18T00:00:00.000Z'),
      }),
    ).resolves.toBe('NOT_CONFIGURED');
    expect(createTransport).not.toHaveBeenCalled();
  });
});
