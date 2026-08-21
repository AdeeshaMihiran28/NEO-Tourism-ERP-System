export type CustomerType = "NEW" | "REPEAT" | "REFERRAL";

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

export interface CustomerDetail extends CustomerListItem {
  createdBy: CustomerNote["createdBy"];
  updatedBy: CustomerNote["createdBy"];
  notes: CustomerNote[];
  summary: {
    totalLeads: number;
    totalBookings: number;
  };
}

export interface CustomerListResponse {
  data: CustomerListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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
  secondaryPhone?: string;
  dateOfBirth?: string;
  nationality?: string;
  customerType: CustomerType;
  isActive?: boolean;
  confirmDuplicate?: boolean;
}
