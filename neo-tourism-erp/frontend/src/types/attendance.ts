export type AttendanceState =
  | "NOT_CHECKED_IN"
  | "WORKING"
  | "ON_BREAK"
  | "CHECKED_OUT";

export interface AttendanceStatus {
  eligible: boolean;
  id?: string;
  state?: AttendanceState;
  activeSince?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedSeconds?: number;
  breakSeconds?: number;
  remainingBreakSeconds?: number | null;
  excessBreakSeconds?: number | null;
  breakSessionsUsed?: number;
  maxBreakSessions?: number | null;
  canStartBreak?: boolean;
  flexibleBreaks?: boolean;
}
