export type DataScope = 'ORGANISATION' | 'TEAM' | 'SELF';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  emailVerified: boolean;
  lastLoginAt: string | null;
  role: { key: string; name: string; dataScope: DataScope };
  permissions: string[];
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: { name: string } | null;
    designation: { name: string } | null;
  } | null;
  organisation: { id: string; name: string; hasLogo: boolean; currency: string; timezone: string; fiscalYear: string; dateFormat: string; workingDays: number[] };
  homeOrganisationId: string;
}

export type EmploymentStatus = 'ACTIVE' | 'PROBATION' | 'ON_LEAVE' | 'SUSPENDED' | 'RESIGNED' | 'TERMINATED' | 'RETIRED';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY';

export interface Ref {
  id: string;
  name: string;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  joinDate: string;
  status: EmploymentStatus;
  employmentType: EmploymentType;
  hasPhoto: boolean;
  department: { id: string; name: string; code: string } | null;
  designation: Ref | null;
  manager: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
}

export interface Employee extends EmployeeListItem {
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  maritalStatus: string | null;
  dateOfBirth: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  municipality: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  citizenshipNumber: string | null;
  panNumber: string | null;
  exitDate: string | null;
  departmentId: string | null;
  designationId: string | null;
  managerId: string | null;
  supervisorId: string | null;
  supervisor: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
  branch: string | null;
  workLocation: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  ssfNumber: string | null;
  pfNumber: string | null;
  citNumber: string | null;
  taxCategory: 'INDIVIDUAL' | 'COUPLE';
  notes: string | null;
  user: { id: string; email: string; status: string; role: { name: string } } | null;
  reports: { id: string; firstName: string; lastName: string; employeeCode: string; designation: { name: string } | null }[];
  currentShift: Shift | null;
  currentSalary: { id: string; basicSalary: number; effectiveFrom: string } | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  headId: string | null;
  head: { id: string; firstName: string; lastName: string; employeeCode: string } | null;
  status: 'ACTIVE' | 'INACTIVE';
  _count: { employees: number; designations: number };
}

export interface Designation {
  id: string;
  name: string;
  description: string | null;
  level: number;
  status: 'ACTIVE' | 'INACTIVE';
  departmentId: string | null;
  department: Ref | null;
  _count: { employees: number };
}

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  gracePeriod: number;
  breakDuration: number;
  workingHours: string | number;
  isFlexible: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  isDefault?: boolean;
  _count?: { employees: number };
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND' | 'WORK_FROM_HOME';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: AttendanceStatus;
  workMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  remarks: string | null;
  source: string;
  employee: { id: string; employeeCode: string; department: Ref | null };
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'PUBLIC' | 'ORGANISATION' | 'OPTIONAL';
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  description: string | null;
  annualDays: number;
  carryForward: boolean;
  maxCarryForward: number;
  requiresDocument: boolean;
  requiresHrApproval: boolean;
  paid: boolean;
  allowHalfDay: boolean;
  limitToBalance: boolean;
  status: 'ACTIVE' | 'INACTIVE';
}

export type LeaveStatus = 'PENDING' | 'SUPERVISOR_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  hasAttachment: boolean;
  attachmentName: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  canAct?: boolean;
  employee: { id: string; employeeCode: string; department: { id: string; name: string } | null };
  leaveType: { id: string; name: string; code: string; paid: boolean; requiresHrApproval: boolean };
}

export interface LeaveBalance {
  id: string;
  year: number;
  leaveType: { id: string; name: string; code: string; limitToBalance: boolean; paid: boolean };
  employee: { id: string; employeeCode: string; fullName: string; department: { name: string } | null };
  entitled: number;
  carriedForward: number;
  adjusted: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: 'EARNING' | 'DEDUCTION';
  category: string;
  calculationType: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS';
  defaultValue: number;
  taxable: boolean;
  reducesTaxableIncome: boolean;
  employerContribution: number;
  isRecurring: boolean;
  sortOrder: number;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export type PayrollStatus = 'DRAFT' | 'PROCESSING' | 'REVIEWED' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface PayrollRun {
  id: string;
  year: number;
  month: number;
  period: string;
  status: PayrollStatus;
  workingDays: number;
  employeeCount: number;
  totalGross: number;
  totalDeductions: number;
  totalTax: number;
  totalNet: number;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  generatedBy?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  locked?: boolean;
  disclaimer?: string;
  byDepartment?: { department: string; employees: number; gross: number; net: number; tax: number }[];
}

export interface PayrollItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  departmentName: string | null;
  designationName: string | null;
  basicSalary: number;
  totalAllowances: number;
  grossSalary: number;
  taxableIncome: number;
  taxAmount: number;
  pfSsf: number;
  retirementContribution: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  workingDays: number;
  payableDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidDays: number;
  overtimeMinutes: number;
  calculationNotes: {
    dailyRate?: number;
    annualTaxableIncome?: number;
    annualTax?: number;
    taxBreakdown?: { ruleName: string; from: number; to: number | null; taxableAmount: number; rate: number; tax: number; waived: boolean }[];
    disclaimer?: string;
    ssfContributor?: boolean;
    taxCategory?: string;
  };
  components: { id: string; code: string; name: string; type: 'EARNING' | 'DEDUCTION'; category: string; amount: number }[];
  payslip: { id: string; payslipNumber: string } | null;
}

export interface TaxRule {
  id: string;
  fiscalYear: string;
  ruleName: string;
  category: 'ALL' | 'INDIVIDUAL' | 'COUPLE';
  threshold: number;
  rate: number;
  deduction: number;
  waivedForSsf: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  department: string | null;
  designation: string | null;
}
