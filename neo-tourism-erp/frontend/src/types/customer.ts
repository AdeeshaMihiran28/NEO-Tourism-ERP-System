export type CustomerType = "NEW" | "REPEAT" | "REFERRAL";

export const customerTypeLabel: Record<CustomerType, string> = {
  NEW: "New",
  REPEAT: "Repeat",
  REFERRAL: "Referral",
};

export interface CustomerListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  customerType: CustomerType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalInquiries: number;
  totalBookings: number;
  lastInquiryAt: string | null;
  lastBookingAt: string | null;
}

export interface CustomerNote {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface CustomerDetail extends Omit<CustomerListItem, "totalInquiries" | "totalBookings" | "lastInquiryAt" | "lastBookingAt"> {
  createdBy: CustomerNote["createdBy"];
  updatedBy: CustomerNote["createdBy"];
  leads: Array<{
    id: string;
    receivedAt: string | null;
    createdAt: string;
    destination: string | null;
    travelDate: string | null;
    travelEndDate: string | null;
    source: string | null;
    status: string;
    lastMeaningfulActivityAt: string | null;
    updatedAt: string;
    assignedUser: CustomerNote["createdBy"] | null;
  }>;
  bookings: Array<{
    id: string;
    folderNumber: string;
    destination: string;
    travelStartDate: string;
    travelEndDate: string | null;
    createdAt: string;
    travelStatus: string;
    operationsStatus: string;
    folderStatus: string;
    salesAdvisor: CustomerNote["createdBy"];
    references: Array<{ id: string; type: string; reference: string }>;
  }>;
  summary: {
    totalLeads: number;
    totalCompletedSales: number;
    totalBookings: number;
    latestInquiryAt: string | null;
    latestBookingAt: string | null;
    lastActivityAt: string;
  };
  leadPagination: Pagination;
  bookingPagination: Pagination;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CustomerListResponse {
  data: CustomerListItem[];
  pagination: Pagination;
}

export interface DuplicateCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  customerType: CustomerType;
  isActive: boolean;
}

export interface CustomerInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  secondaryPhone?: string | null;
  dateOfBirth?: string;
  nationality?: string;
  customerType: CustomerType;
  isActive?: boolean;
  confirmDuplicate?: boolean;
}
