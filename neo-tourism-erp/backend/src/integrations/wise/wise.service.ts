import {
  Injectable,
  NotImplementedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  IncomingPaymentMatch,
  PaymentVerificationProvider,
} from './wise.types';
import { wiseConfigured } from './wise.config';

@Injectable()
export class WiseService implements PaymentVerificationProvider {
  findIncomingPayment(reference: string): Promise<IncomingPaymentMatch> {
    void reference;
    if (!wiseConfigured())
      throw new ServiceUnavailableException(
        'Wise integration is not configured.',
      );
    throw new NotImplementedException(
      'Wise credentials are present, but a verified provider API adapter has not been configured.',
    );
  }
}

/** DEVELOPMENT / MOCK ONLY. Never use this adapter as proof of a real payment. */
export class MockWiseService implements PaymentVerificationProvider {
  findIncomingPayment(reference: string): Promise<IncomingPaymentMatch> {
    return Promise.resolve({
      reference,
      amount: 1250,
      currency: 'GBP',
      status: 'RECEIVED',
      receivedAt: new Date('2026-01-01T12:00:00.000Z'),
    });
  }
}
