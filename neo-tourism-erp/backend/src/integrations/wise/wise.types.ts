export interface IncomingPaymentMatch {
  reference: string;
  amount: number;
  currency: string;
  status: 'RECEIVED' | 'PENDING' | 'NOT_FOUND';
  receivedAt: Date | null;
}

export interface PaymentVerificationProvider {
  findIncomingPayment(reference: string): Promise<IncomingPaymentMatch>;
}

export interface SalesSafePaymentView {
  paymentReference: string;
  amount: number;
  currency: string;
  status: IncomingPaymentMatch['status'];
  receivedAt: Date | null;
}
