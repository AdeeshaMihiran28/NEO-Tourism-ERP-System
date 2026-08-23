export interface MakeCallInput {
  leadId: string;
  userId: string;
}
export interface TelephonyCallResult {
  externalCallId: string;
  status: 'INITIATED';
}
export interface TelephonyProvider {
  makeCall(input: MakeCallInput): Promise<TelephonyCallResult>;
}
