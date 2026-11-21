import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

export type InvitationDelivery = 'SENT' | 'FAILED' | 'NOT_CONFIGURED';

export const INVITATION_SUBJECT = 'Your Neo Tourism ERP Account Is Ready';

@Injectable()
export class InvitationMailerService {
  private readonly logger = new Logger(InvitationMailerService.name);

  async send(input: {
    to: string;
    firstName: string;
    employeeNumber: string;
    loginEmail: string;
    invitationLink: string;
    expiresAt: Date;
  }): Promise<InvitationDelivery> {
    const config = smtpConfig();
    if (!config) return 'NOT_CONFIGURED';

    const expiry =
      input.expiresAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    try {
      const transporter = createTransport(config.transport);
      await transporter.sendMail({
        from: config.from,
        to: input.to,
        subject: INVITATION_SUBJECT,
        text: [
          `Hello ${input.firstName},`,
          '',
          'Your Neo Tourism ERP account has been created.',
          '',
          `Employee ID: ${input.employeeNumber}`,
          `Login Email: ${input.loginEmail}`,
          '',
          'Please create your password using the secure link below.',
          input.invitationLink,
          '',
          `This link expires at ${expiry} and can only be used once.`,
          '',
          'If you were not expecting this account, please contact Neo Tourism IT/HR.',
          '',
          'Neo Tourism',
          'ERP System',
        ].join('\n'),
        html: [
          `<p>Hello ${escapeHtml(input.firstName)},</p>`,
          '<p>Your Neo Tourism ERP account has been created.</p>',
          `<p><strong>Employee ID:</strong> ${escapeHtml(input.employeeNumber)}<br/>`,
          `<strong>Login Email:</strong> ${escapeHtml(input.loginEmail)}</p>`,
          '<p>Please create your password using the secure link below.</p>',
          `<p><a href="${escapeHtml(input.invitationLink)}" style="display:inline-block;padding:12px 24px;background:#0e7490;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;">Set Your Password</a></p>`,
          `<p><small>If the button does not work, copy this link into your browser:<br/>${escapeHtml(input.invitationLink)}</small></p>`,
          `<p>This link expires at ${escapeHtml(expiry)} and can only be used once.</p>`,
          '<p>If you were not expecting this account, please contact Neo Tourism IT/HR.</p>',
          '<p>Neo Tourism<br/>ERP System</p>',
        ].join('\n'),
      });
      return 'SENT';
    } catch (error) {
      // Safe: recipient address only; never credentials, tokens or hashes.
      this.logger.error(
        `Unable to email an ERP invitation to ${input.to}.`,
        error instanceof Error ? error.stack : undefined,
      );
      return 'FAILED';
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function smtpConfigured(): boolean {
  return smtpConfig() !== null;
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const user =
    process.env.SMTP_USER?.trim() || process.env.SMTP_USERNAME?.trim();
  const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  if (!host || !from || !user || !pass) return null;

  const configuredPort = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isInteger(configuredPort) ? configuredPort : 587;
  return {
    from,
    transport: {
      host,
      port,
      secure:
        process.env.SMTP_SECURE === 'true' ||
        (process.env.SMTP_SECURE !== 'false' && port === 465),
      auth: { user, pass },
    },
  };
}
