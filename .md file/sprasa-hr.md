# Sprasa HR — Complete HR Management Software Specification

## 1. Project Overview

Build a production-ready **HR Management Software** called **Sprasa HR** for Nepali organisations.

### Product positioning

> Employee records, attendance, leave, payroll, departments and reporting in one system built for Nepali organisations.

The system must manage the complete employee lifecycle:

- Employee records
- Departments and designations
- Employment history
- Documents
- Attendance
- Shifts
- Leave management
- Payroll
- Allowances
- Deductions
- Tax handling
- Payslips
- Payroll registers
- HR reports
- Audit logs
- User and role management
- Organisation settings

The application must be built using **Node.js** and should be designed as a secure, maintainable, scalable business application.

---

# 2. Brand

## Company

**Sprasa Technical Solution**

Website:
`https://sprasatechnicalsolution.com.np/`

## Product

**Sprasa HR**

Suggested product slug:

`sprasa-hr`

Suggested application title:

`Sprasa HR — Human Resource Management System`

Suggested tagline:

`Simple HR management for Nepali organisations.`

---

# 3. Required Technology Stack

Use a modern Node.js stack.

## Backend

- Node.js
- TypeScript
- Express.js
- REST API architecture
- Prisma ORM
- PostgreSQL

## Frontend

Use:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui or an equivalent professional component system
- Lucide icons
- Recharts for charts

The frontend and backend should be logically separated.

Suggested structure:

```text
sprasa-hr/
├── frontend/
├── backend/
├── prisma/
├── docs/
├── uploads/
├── .env.example
├── docker-compose.yml
├── README.md
└── package.json
```

---

# 4. General Product Requirements

The application must be:

- Responsive
- Mobile friendly
- Desktop friendly
- Secure
- Fast
- Accessible
- SEO-friendly for public pages
- Easy to maintain
- Modular
- API-driven
- Multi-organisation ready
- Suitable for Nepali businesses, schools, consultancies, offices and service organisations

Use clean architecture and reusable components.

Do not create one huge file.

Keep:

- Controllers
- Services
- Routes
- Middleware
- Validation
- Database models
- Utilities
- Components
- Pages
- API clients

properly separated.

---

# 5. User Roles

Implement role-based access control.

Default roles:

## Super Admin

Full system access.

Permissions:

- Manage organisations
- Manage users
- Manage roles
- Manage employees
- Manage payroll
- Manage attendance
- Manage leave
- Manage reports
- Manage settings
- View audit logs

## HR Admin

Can manage:

- Employees
- Departments
- Designations
- Attendance
- Leave
- Payroll
- Reports
- Documents

Cannot manage platform-level super admin settings.

## HR Officer

Can manage:

- Employee records
- Attendance
- Leave
- Documents

Limited payroll access.

## Manager / Supervisor

Can:

- View assigned employees
- Approve/reject leave
- View attendance
- View team reports

## Accountant

Can:

- View employee salary
- Process payroll
- Generate payslips
- Generate payroll reports

Should not have unrestricted HR settings access.

## Employee

Employee self-service:

- View own profile
- View attendance
- Apply leave
- View leave balances
- View payslips
- Download documents
- Update allowed personal information

---

# 6. Authentication

Implement secure authentication.

Required:

- Login
- Logout
- Forgot password
- Reset password
- Change password
- Email verification
- Session/token management
- Role-based authorization
- Account status
- Login history
- Optional 2FA architecture

Use secure password hashing such as:

`bcrypt` or `argon2`

Never store plain-text passwords.

Use:

- JWT access token
- Refresh token
- Secure HTTP-only cookies where appropriate
- Rate limiting
- CSRF protection where applicable
- Input validation
- Security headers
- CORS configuration

---

# 7. Organisation Management

The application should support multiple organisations.

Organisation fields:

```text
id
name
legal_name
registration_number
pan_number
address
province
district
municipality
phone
email
website
logo
timezone
currency
fiscal_year
status
created_at
updated_at
```

Default currency:

`NPR`

Default timezone:

`Asia/Kathmandu`

---

# 8. Dashboard

Create a professional HR dashboard.

Show:

- Total employees
- Active employees
- On leave today
- Present today
- Absent today
- Late today
- Departments
- Current payroll amount
- Pending leave requests
- Recent employee additions
- Recent attendance activity

Charts:

### Employee Distribution

Department-wise employee count.

### Attendance Overview

Present / absent / leave / late.

### Payroll Overview

Monthly payroll trend.

### Leave Overview

Leave usage by type.

Use responsive charts.

---

# 9. Employee Management

Create complete employee CRUD.

## Employee fields

```text
Employee ID
First Name
Middle Name
Last Name
Gender
Date of Birth
Phone
Email
Address
Emergency Contact
Emergency Contact Phone
Citizenship Number
PAN Number
Photo
Join Date
Employment Type
Employment Status
Department
Designation
Manager
Branch
Work Location
Shift
Basic Salary
Bank Name
Bank Account Number
Social Security / PF information
Documents
Notes
```

Employment types:

- Full Time
- Part Time
- Contract
- Intern
- Temporary

Employment statuses:

- Active
- Probation
- On Leave
- Suspended
- Resigned
- Terminated
- Retired

---

# 10. Employee Profile

Create a detailed employee profile page.

Tabs:

1. Overview
2. Personal Information
3. Employment
4. Attendance
5. Leave
6. Payroll
7. Documents
8. Employment History
9. Activity

Show an employee summary card.

Include:

- Profile photo
- Employee ID
- Name
- Department
- Designation
- Join date
- Employment status

---

# 11. Employee Documents

Allow HR to upload documents.

Examples:

- Citizenship
- Passport
- Contract
- Appointment letter
- Education certificate
- Experience letter
- Tax document
- Other documents

Document fields:

```text
id
employee_id
document_type
title
file_path
file_name
file_size
mime_type
expiry_date
uploaded_by
created_at
```

Allow:

- Upload
- Preview where possible
- Download
- Delete
- Expiry tracking

Never expose private files through public URLs.

---

# 12. Departments

CRUD:

- Department name
- Code
- Description
- Department head
- Status

Examples:

- Administration
- Finance
- HR
- IT
- Marketing
- Operations
- Sales

---

# 13. Designations

CRUD:

- Designation name
- Department
- Description
- Level
- Status

Examples:

- Managing Director
- HR Manager
- HR Officer
- Accountant
- Software Engineer
- Technician
- Supervisor
- Assistant

---

# 14. Reporting Structure

Support employee reporting lines.

Example:

```text
Managing Director
      |
HR Manager
      |
HR Officer
      |
Employees
```

An employee can have:

- Manager
- Department head
- Supervisor

Provide an organisation hierarchy view.

---

# 15. Attendance Management

Create attendance management.

Attendance states:

- Present
- Absent
- Late
- Half Day
- Leave
- Holiday
- Weekend
- Work From Home

Attendance fields:

```text
employee_id
date
shift_id
check_in
check_out
status
late_minutes
early_leave_minutes
overtime_minutes
remarks
source
```

Attendance source:

- Manual
- Admin
- Import
- Device/API
- Employee

---

# 16. Attendance Dashboard

Show:

- Today's attendance
- Present count
- Absent count
- Late count
- Leave count

Allow filtering:

- Date
- Department
- Employee
- Status

Provide:

- Search
- Pagination
- Export
- Bulk attendance entry

---

# 17. Shift Management

Create shift management.

Fields:

```text
name
start_time
end_time
grace_period
break_duration
working_hours
status
```

Example:

```text
Morning Shift
09:00 — 17:00
Grace Period: 15 minutes
```

Support:

- Fixed shifts
- Flexible architecture
- Multiple shifts
- Employee shift assignment

---

# 18. Leave Management

Create leave types.

Examples:

- Annual Leave
- Sick Leave
- Casual Leave
- Maternity Leave
- Paternity Leave
- Unpaid Leave
- Other

Leave type fields:

```text
name
code
annual_days
carry_forward
max_carry_forward
requires_document
paid
status
```

---

# 19. Leave Workflow

Employee:

```text
Apply Leave
     ↓
Supervisor Review
     ↓
HR Review if required
     ↓
Approved / Rejected
```

Leave application fields:

```text
employee
leave_type
start_date
end_date
total_days
reason
attachment
status
approved_by
approved_at
rejection_reason
```

Leave balances must automatically update after approval.

Prevent:

- Overlapping leave
- Invalid dates
- Leave exceeding available balance where applicable

---

# 20. Leave Dashboard

Show:

- Pending requests
- Approved requests
- Rejected requests
- Current balances
- Upcoming leave
- Employees currently on leave

Provide calendar view.

---

# 21. Payroll

Create a monthly payroll system.

Payroll must support:

### Earnings

- Basic Salary
- Housing Allowance
- Transport Allowance
- Food Allowance
- Overtime
- Bonus
- Commission
- Other Allowance

### Deductions

- Tax
- Provident Fund
- Social Security contributions
- Loan
- Advance
- Unpaid Leave
- Other deductions

Use configurable payroll components.

Do not hard-code every organisation's payroll rules.

---

# 22. Salary Structure

Each employee should have a salary structure.

Example:

```text
Basic Salary
+ Allowances
+ Overtime
+ Bonus
----------------
Gross Salary

- Tax
- PF / SSF
- Loan
- Advance
- Other deductions
----------------
Net Salary
```

Store historical salary structures.

When salary changes:

Do not overwrite old payroll history.

Create a new effective salary structure.

---

# 23. Payroll Processing

Monthly workflow:

```text
Select Month
      ↓
Load Active Employees
      ↓
Load Salary Structures
      ↓
Calculate Attendance
      ↓
Calculate Leave
      ↓
Calculate Allowances
      ↓
Calculate Deductions
      ↓
Calculate Tax
      ↓
Generate Payroll
      ↓
Review
      ↓
Approve
      ↓
Generate Payslips
```

Payroll statuses:

- Draft
- Processing
- Reviewed
- Approved
- Paid
- Cancelled

Approved payroll should be protected from accidental modification.

---

# 24. Payroll Calculation Engine

Build payroll calculations as a service.

Example:

```text
gross_salary =
basic_salary +
allowances +
overtime +
bonus

total_deductions =
tax +
pf +
ssf +
loan +
advance +
other_deductions

net_salary =
gross_salary - total_deductions
```

Important:

Payroll rules should be configurable.

Do not assume one universal tax calculation.

Create a configurable tax/rule engine so organisation-specific and Nepal-specific rules can be updated without rewriting the whole application.

Clearly label tax calculations as configuration-dependent.

---

# 25. Payslip

Generate professional payslips.

Payslip should contain:

- Organisation logo
- Organisation name
- Address
- Employee name
- Employee ID
- Department
- Designation
- Pay period
- Basic salary
- Earnings
- Deductions
- Gross salary
- Net salary
- Payment information
- Generated date

Provide:

- PDF download
- Print
- Employee portal access

---

# 26. Payroll Register

Create payroll register.

Columns:

```text
Employee ID
Employee Name
Department
Basic
Allowances
Gross
Tax
PF/SSF
Other Deductions
Net Salary
Status
```

Support:

- Search
- Filter
- Pagination
- CSV export
- Excel export
- PDF export

---

# 27. Tax Configuration

Create a configurable tax module.

Do not hard-code tax rates directly into frontend components.

Store configuration:

```text
fiscal_year
rule_name
threshold
rate
deduction
effective_from
effective_to
status
```

Allow authorised administrators to update rules.

Add a visible warning:

> Payroll and tax calculations should be configured according to the organisation's current applicable Nepal rules and verified by the organisation's accountant/tax professional.

---

# 28. Reports

Create a central Reports module.

Reports:

### Employee Reports

- Employee list
- Department headcount
- Designation report
- New joiners
- Resigned employees
- Employee turnover

### Attendance Reports

- Daily attendance
- Monthly attendance
- Late report
- Absence report
- Overtime report

### Leave Reports

- Leave balance
- Leave usage
- Leave by department
- Leave history

### Payroll Reports

- Monthly payroll
- Payroll register
- Department payroll
- Salary summary
- Deduction summary
- Tax summary

Every report should support:

- Date filter
- Department filter
- Employee filter
- Export

---

# 29. Audit Logs

Track important actions.

Example:

```text
User
Action
Module
Record
Old Value
New Value
IP Address
User Agent
Timestamp
```

Actions:

- Login
- Logout
- Employee created
- Employee updated
- Employee deleted
- Salary changed
- Payroll generated
- Payroll approved
- Leave approved
- Leave rejected
- Settings changed

Audit logs should be read-only for normal administrators.

---

# 30. Notifications

Create notification architecture.

Notification types:

- Leave request submitted
- Leave approved
- Leave rejected
- Payroll processed
- Payslip available
- Document expiry
- Attendance reminder
- Password/security alert

Channels:

- In-app
- Email

Design the notification service so SMS/push notifications can be added later.

---

# 31. Email

Use SMTP or a transactional email provider.

Email templates:

- Welcome email
- Password reset
- Leave submitted
- Leave approved
- Leave rejected
- Payslip notification
- Document expiry warning

Use reusable templates.

---

# 32. Employee Self-Service Portal

Employees should have their own dashboard.

Show:

- Profile
- Attendance today
- Monthly attendance
- Leave balance
- Apply leave
- Leave history
- Payslips
- Documents
- Notifications

Employees must never access another employee's private information.

---

# 33. Admin UI

Create a premium SaaS-style dashboard.

Sidebar:

```text
Dashboard

People
  Employees
  Departments
  Designations
  Organisation Chart

Attendance
  Attendance
  Shifts
  Holidays

Leave
  Leave Requests
  Leave Types
  Leave Balances
  Leave Calendar

Payroll
  Salary Structures
  Payroll
  Payslips
  Payroll Register
  Tax Configuration

Reports

Documents

Notifications

Users & Roles

Audit Logs

Settings
```

---

# 34. UI Design

Use a professional business SaaS interface.

Design goals:

- Clean
- Modern
- Minimal
- Professional
- Fast
- Accessible

Use:

- Cards
- Tables
- Badges
- Tabs
- Drawers
- Modals
- Dropdowns
- Date pickers
- Charts
- Toast notifications
- Skeleton loading
- Empty states
- Confirmation dialogs

Avoid excessive gradients and unnecessary animations.

---

# 35. Responsive Design

Desktop:

- Sidebar
- Large dashboard
- Data tables

Tablet:

- Collapsible sidebar
- Responsive tables

Mobile:

- Bottom navigation or compact sidebar
- Mobile-friendly forms
- Card-based employee data
- Responsive payroll tables
- Touch-friendly buttons

---

# 36. Theme

Support:

- Light mode
- Dark mode

Suggested brand direction:

Primary:

`#0F766E`

Secondary:

`#0EA5A4`

Neutral:

Slate/gray palette.

Do not make the application overly colorful.

---

# 37. Database Design

Use PostgreSQL with Prisma.

Core models should include:

```text
Organisation
User
Role
Permission
Employee
Department
Designation
EmploymentHistory
EmployeeDocument
Shift
EmployeeShift
Attendance
LeaveType
LeaveBalance
LeaveRequest
Holiday
SalaryStructure
SalaryComponent
EmployeeSalary
Payroll
PayrollItem
PayrollComponent
Payslip
TaxRule
Notification
AuditLog
```

Use proper:

- Foreign keys
- Unique constraints
- Indexes
- Cascading rules where appropriate
- Soft delete where appropriate
- Created/updated timestamps

---

# 38. Suggested Prisma Relationship Structure

Example:

```text
Organisation
 ├── Users
 ├── Employees
 ├── Departments
 ├── Designations
 ├── Shifts
 ├── LeaveTypes
 ├── Payrolls
 └── Settings

Employee
 ├── Department
 ├── Designation
 ├── Manager
 ├── Documents
 ├── Attendance
 ├── LeaveRequests
 ├── LeaveBalances
 ├── SalaryHistory
 └── Payslips
```

---

# 39. API Architecture

Use REST API.

Base URL:

```text
/api/v1
```

## Authentication

```text
POST /auth/login
POST /auth/logout
POST /auth/refresh
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/change-password
```

## Employees

```text
GET    /employees
POST   /employees
GET    /employees/:id
PUT    /employees/:id
DELETE /employees/:id
```

## Departments

```text
GET    /departments
POST   /departments
PUT    /departments/:id
DELETE /departments/:id
```

## Attendance

```text
GET  /attendance
POST /attendance
PUT  /attendance/:id
POST /attendance/bulk
```

## Leave

```text
GET  /leave/requests
POST /leave/requests
PUT  /leave/requests/:id
POST /leave/requests/:id/approve
POST /leave/requests/:id/reject
```

## Payroll

```text
GET  /payroll
POST /payroll/generate
GET  /payroll/:id
POST /payroll/:id/approve
POST /payroll/:id/cancel
```

## Reports

```text
GET /reports/employees
GET /reports/attendance
GET /reports/leave
GET /reports/payroll
```

---

# 40. API Security

Every protected API route must verify:

1. Authentication
2. Organisation
3. Role
4. Permission
5. Resource ownership where required

Prevent:

- IDOR
- Privilege escalation
- SQL injection
- XSS
- CSRF where relevant
- Brute-force login
- File upload attacks
- Mass assignment

Validate request bodies using a schema validation library such as Zod.

---

# 41. File Upload Security

Allowed document types should be configurable.

Validate:

- MIME type
- File extension
- File size

Rename uploaded files using generated identifiers.

Never trust original filenames.

Store uploads outside publicly accessible static directories when possible.

---

# 42. Pagination

Every large dataset must support server-side pagination.

Example:

```text
?page=1&limit=25
```

Return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 25,
    "total": 100,
    "totalPages": 4
  }
}
```

---

# 43. Search

Implement global and module-specific search.

Employee search:

- Name
- Employee ID
- Email
- Phone
- Department
- Designation

Use debounced frontend search and indexed backend queries.

---

# 44. Import / Export

Employee import:

- CSV
- Excel

Provide:

1. Download template
2. Upload file
3. Validate rows
4. Preview errors
5. Confirm import
6. Import records
7. Show result

Do not partially import invalid data without clearly informing the administrator.

---

# 45. Backup

Design backup strategy.

Database:

- Scheduled PostgreSQL backups
- Configurable retention

Uploaded documents:

- Backup storage
- Retention policy

Provide backup status in admin settings where practical.

---

# 46. Error Handling

Backend must return consistent errors.

Example:

```json
{
  "success": false,
  "message": "Employee not found",
  "code": "EMPLOYEE_NOT_FOUND"
}
```

Do not expose:

- Stack traces
- Database credentials
- Internal paths
- Sensitive server information

in production.

---

# 47. Logging

Use structured application logging.

Log:

- Request ID
- Method
- URL
- Status
- Response time
- User ID when available
- Error details

Do not log passwords, tokens or sensitive personal data.

---

# 48. Environment Variables

Create `.env.example`.

Example:

```env
NODE_ENV=development

PORT=5000

DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

FRONTEND_URL=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

UPLOAD_DIR=

MAX_FILE_SIZE=
```

Never commit real secrets.

---

# 49. Development Environment

Provide:

```text
npm install
npm run dev
npm run build
npm run start
npm run lint
npm run test
```

For database:

```text
npx prisma generate
npx prisma migrate dev
npx prisma studio
```

---

# 50. Docker

Provide Docker support.

Services:

```text
frontend
backend
postgres
```

Optional:

```text
redis
```

Use Docker Compose for local development.

---

# 51. Testing

Implement:

## Unit tests

Test:

- Payroll calculations
- Leave balance calculations
- Attendance calculations
- Tax rule engine
- Permission checks

## Integration tests

Test:

- Authentication
- Employee CRUD
- Leave workflow
- Payroll workflow

## Frontend tests

Test important:

- Forms
- Tables
- Authentication
- Leave application
- Payroll review

---

# 52. Payroll Calculation Test Example

Example input:

```text
Basic salary: NPR 30,000
Allowance: NPR 5,000
Overtime: NPR 2,000
Deduction: NPR 1,000
```

Gross:

```text
37,000
```

Net before applicable tax/statutory deductions:

```text
36,000
```

The exact tax/statutory result must come from the configured payroll rules rather than a hard-coded example.

---

# 53. Leave Calculation

Example:

Employee:

```text
Annual Leave entitlement = 18 days
Used = 5 days
```

Remaining:

```text
13 days
```

If carry-forward is enabled, apply the configured carry-forward policy.

---

# 54. Holiday Management

Create holiday calendar.

Fields:

```text
name
date
type
description
status
```

Types:

- Public Holiday
- Organisation Holiday
- Optional Holiday

Attendance calculations must consider holidays.

---

# 55. Organisation Settings

Settings:

- Organisation profile
- Logo
- Address
- Contact information
- Fiscal year
- Currency
- Date format
- Timezone
- Working days
- Default shift
- Leave settings
- Payroll settings
- Tax configuration
- Notification settings
- Email settings

---

# 56. Nepal Localization

The product is intended for Nepal.

Support:

- NPR currency
- Asia/Kathmandu timezone
- Nepali phone number formats
- Nepal address structure
- PAN field
- Citizenship field
- Nepal-specific payroll configuration
- Fiscal year configuration

Do not hard-code tax rules without a configuration mechanism.

Support future Nepali localization such as:

- Nepali language
- Bikram Sambat dates
- Nepal-specific reports

as extensible features.

---

# 57. Security Requirements

Implement:

- Password hashing
- JWT/session security
- HTTP-only cookies where applicable
- Rate limiting
- Helmet
- CORS
- Input validation
- Output sanitisation
- RBAC
- Audit logs
- Secure uploads
- Database constraints
- Secure password reset tokens
- Token expiration
- Refresh token rotation where appropriate

---

# 58. Privacy

Employee information is sensitive.

Apply privacy-by-design.

Restrict access to:

- Salary
- Bank details
- Citizenship information
- PAN
- Documents
- Personal contact information

Use permission checks at API level, not only frontend level.

---

# 59. Performance

Optimize:

- Database queries
- Pagination
- Indexing
- API response size
- Image uploads
- Dashboard queries

Avoid N+1 database queries.

Use caching only where useful and safe.

---

# 60. Frontend Folder Structure

Suggested:

```text
frontend/src/
├── components/
├── layouts/
├── pages/
├── features/
│   ├── auth/
│   ├── employees/
│   ├── attendance/
│   ├── leave/
│   ├── payroll/
│   ├── reports/
│   └── settings/
├── hooks/
├── services/
├── lib/
├── types/
├── routes/
├── utils/
└── App.tsx
```

---

# 61. Backend Folder Structure

Suggested:

```text
backend/src/
├── config/
├── controllers/
├── services/
├── routes/
├── middleware/
├── validators/
├── repositories/
├── utils/
├── types/
├── jobs/
├── emails/
├── modules/
│   ├── auth/
│   ├── employees/
│   ├── attendance/
│   ├── leave/
│   ├── payroll/
│   ├── reports/
│   └── settings/
├── app.ts
└── server.ts
```

---

# 62. Seed Data

Create development seed data.

Organisation:

```text
Sprasa Demo Organisation
```

Departments:

```text
Administration
Finance
HR
IT
Operations
Marketing
```

Users:

```text
superadmin
hradmin
manager
accountant
employee
```

Create realistic demo employees.

Do not use real people's personal information.

---

# 63. Demo Dashboard

The initial installation should open with useful demo data.

Dashboard should show realistic:

- Employee counts
- Attendance
- Leave
- Payroll
- Departments

Do not leave the dashboard empty after installation.

---

# 64. UX Requirements

Every form should include:

- Label
- Placeholder
- Validation
- Error message
- Required indicator where appropriate
- Loading state
- Success feedback

Every destructive action should require confirmation.

Example:

> Are you sure you want to delete this employee?

---

# 65. Tables

Tables should support:

- Search
- Filters
- Sorting
- Pagination
- Column visibility where useful
- Export
- Row actions

Mobile tables should transform into responsive cards when necessary.

---

# 66. Empty States

Do not display blank screens.

Example:

```text
No employees found.

Add your first employee to start managing your workforce.
```

Include a relevant action button.

---

# 67. Loading States

Use skeleton loaders for:

- Dashboard cards
- Tables
- Employee profile
- Reports
- Payroll

Avoid unnecessary full-page loading.

---

# 68. Public Website / Product Landing Page

If building the public-facing Sprasa HR page, include:

Hero:

> HR management software built for Nepali organisations.

Subheading:

> Manage employees, attendance, leave, payroll and HR reports from one secure platform.

CTA:

> Request a consultation

Secondary CTA:

> Ask a question

Sections:

- Features
- Employee Management
- Attendance
- Leave
- Payroll
- Reports
- Security
- How it works
- FAQ
- Consultation CTA

---

# 69. Original Product Content

Use this product content as the foundation:

## Employee records

Personal details, employment history, department and designation, salary structure and documents — held in one record rather than scattered across files.

## Attendance and leave

Daily attendance, shift handling, and a leave workflow where employees apply, supervisors approve, and balances update automatically by leave type.

## Payroll

Monthly salary processing with allowances, deductions and tax handling, producing payslips per employee and a payroll register for accounts.

## Reporting

Headcount by department, attendance summaries, leave balances and payroll cost reports, exportable for management and audit.

---

# 70. Product Inclusions

Include:

- Employee records with documents and employment history
- Departments, designations and reporting lines
- Attendance tracking with shift support
- Leave applications
- Leave approvals
- Automatic leave balances
- Monthly payroll
- Allowances
- Deductions
- Payslips
- Management reporting
- Audit reporting

---

# 71. Consultation CTA

Use:

> Tell us what you need and we will come back with a written recommendation and a realistic cost.

Contact:

`+9779843944252, 53`

Consultation route:

```text
/consultancy
```

Contact route:

```text
/contact
```

---

# 72. SEO

Public product page metadata:

Title:

`HR Management Software Nepal | Sprasa HR`

Meta description:

`Manage employees, attendance, leave, payroll and HR reports with Sprasa HR, a practical HR management system built for Nepali organisations.`

Suggested keywords:

```text
HR management software Nepal
HR software Nepal
employee management software Nepal
payroll software Nepal
attendance software Nepal
leave management software Nepal
HRMS Nepal
payroll management Nepal
employee attendance system Nepal
Sprasa HR
```

Do not keyword-stuff.

---

# 73. Accessibility

Follow WCAG principles.

Ensure:

- Keyboard navigation
- Visible focus states
- Proper labels
- Semantic HTML
- Sufficient contrast
- Accessible dialogs
- Accessible tables
- Screen-reader-friendly buttons

---

# 74. Internationalization Architecture

Even if the first release is English-only, structure the application so translation can be added later.

Example:

```text
en
ne
```

Do not hard-code all user-facing text deeply inside components.

---

# 75. Future Integrations

Design APIs so future integrations can be added.

Potential integrations:

- Biometric attendance devices
- RFID attendance
- QR attendance
- Google Workspace
- Microsoft 365
- SMS providers
- Email providers
- Accounting software
- Payment gateways
- Nepal payroll/tax services where legally and technically available

Do not implement these unless explicitly requested.

---

# 76. Future Modules

Architecture should allow:

- Recruitment / Applicant Tracking
- Performance Management
- Training Management
- Asset Management
- Expense Management
- Loan Management
- Employee Advances
- Travel Management
- Project Timesheets
- Biometric Integration
- Mobile App
- AI HR Assistant

Keep these out of the initial MVP unless requested.

---

# 77. MVP Priority

Build in this order.

## Phase 1 — Foundation

- Node.js
- TypeScript
- Express
- React
- PostgreSQL
- Prisma
- Authentication
- RBAC
- Organisation

## Phase 2 — Employee Management

- Employees
- Departments
- Designations
- Reporting structure
- Documents

## Phase 3 — Attendance

- Attendance
- Shifts
- Holidays
- Attendance reports

## Phase 4 — Leave

- Leave types
- Leave balances
- Leave requests
- Approval workflow
- Leave reports

## Phase 5 — Payroll

- Salary structures
- Salary components
- Payroll engine
- Configurable deductions
- Tax configuration
- Payslips
- Payroll reports

## Phase 6 — Reporting

- Dashboard
- Employee reports
- Attendance reports
- Leave reports
- Payroll reports

## Phase 7 — Security and Production

- Audit logs
- Security hardening
- Backups
- Logging
- Testing
- Docker
- Production deployment documentation

---

# 78. Development Rules for Claude

When implementing this project:

1. Do not create fake functionality.
2. Do not use mock API responses in production code.
3. Do not hard-code payroll calculations into React components.
4. Keep business logic in backend services.
5. Keep database access through Prisma/repository/service layers.
6. Validate all API input.
7. Protect every private route.
8. Enforce permissions on the backend.
9. Never trust frontend permissions.
10. Never expose sensitive employee information unnecessarily.
11. Do not store secrets in source code.
12. Do not overwrite payroll history.
13. Keep audit records for important changes.
14. Use database transactions for critical workflows.
15. Use proper error handling.
16. Write reusable components.
17. Keep code strongly typed.
18. Avoid duplicated business logic.
19. Add tests for critical payroll and leave calculations.
20. Document setup and deployment.

---

# 79. Database Transaction Requirements

Use transactions for operations such as:

### Leave approval

```text
Approve request
+
Update leave balance
+
Create audit log
```

### Payroll approval

```text
Approve payroll
+
Lock payroll records
+
Generate payslip records
+
Create audit log
```

### Employee creation

```text
Create employee
+
Create employment history
+
Create initial salary structure if provided
+
Create audit log
```

---

# 80. Data Integrity

Use database constraints for:

- Unique employee IDs per organisation
- Unique department codes per organisation
- Unique designation names where appropriate
- Unique email where appropriate
- Valid foreign keys
- Payroll period uniqueness
- Leave balance uniqueness per employee/type/year

Prevent duplicate payroll for the same employee and pay period.

---

# 81. Production Deployment

Prepare documentation for:

### Backend

Node.js server.

### Frontend

Build and serve through:

- Nginx
- CDN
- Static hosting

### Database

PostgreSQL.

### SSL

HTTPS required.

### Domain

Example:

```text
hr.sprasatechnicalsolution.com.np
```

or another production domain configured later.

---

# 82. Deployment Checklist

Before production:

- [ ] Environment variables configured
- [ ] Production database created
- [ ] Prisma migrations applied
- [ ] Secure secrets configured
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] SMTP configured
- [ ] File storage configured
- [ ] Database backup configured
- [ ] Admin account secured
- [ ] Debug mode disabled
- [ ] Error logging configured
- [ ] Rate limiting enabled
- [ ] Audit logging enabled
- [ ] Payroll rules verified
- [ ] Tax configuration verified

---

# 83. README Requirements

Create a complete README containing:

1. Project overview
2. Features
3. Technology stack
4. Requirements
5. Installation
6. Environment variables
7. Database setup
8. Prisma migrations
9. Seed data
10. Development commands
11. Production build
12. Deployment
13. Backup
14. Testing
15. Security
16. Troubleshooting

---

# 84. Claude Implementation Strategy

Claude should work incrementally.

Do not attempt to create the entire project as one giant unstructured response.

Recommended implementation sequence:

```text
Step 1
Project scaffolding

Step 2
Database schema

Step 3
Authentication

Step 4
RBAC

Step 5
Organisation

Step 6
Employee module

Step 7
Department/designation

Step 8
Documents

Step 9
Attendance

Step 10
Shifts and holidays

Step 11
Leave management

Step 12
Payroll

Step 13
Payslips

Step 14
Reports

Step 15
Notifications

Step 16
Audit logs

Step 17
Dashboard

Step 18
Testing

Step 19
Security hardening

Step 20
Production deployment
```

After each major module:

- Check TypeScript errors
- Check Prisma schema
- Run migrations
- Run tests
- Check API routes
- Check frontend build
- Fix errors before continuing

---

# 85. Claude Coding Behaviour

When modifying an existing project:

1. Inspect the existing structure first.
2. Do not unnecessarily rewrite working code.
3. Reuse existing components.
4. Reuse existing authentication if secure.
5. Check dependencies before installing new ones.
6. Explain major architectural changes.
7. Keep changes modular.
8. Run tests/build after significant changes.
9. Fix errors instead of ignoring them.
10. Never claim a feature works without verifying it.

---

# 86. Definition of Done

The project is considered complete only when:

- User can log in
- User permissions work
- Organisation can be configured
- Employees can be created and managed
- Departments work
- Designations work
- Documents work
- Attendance works
- Shifts work
- Holidays work
- Leave workflow works
- Leave balances work
- Salary structures work
- Payroll generation works
- Configurable tax/deduction rules work
- Payslips work
- Reports work
- Exports work
- Audit logs work
- Notifications work
- Employee self-service works
- Responsive UI works
- Error handling works
- Security controls are implemented
- Database migrations work
- Tests pass
- Production build succeeds
- Deployment documentation exists

---

# 87. Important Business Rule

This is HR/payroll software for Nepali organisations.

Payroll, tax, social-security and statutory calculations may change over time.

Therefore:

**Never assume that a fixed tax rate or statutory rule is permanently correct.**

Create configuration and effective-date mechanisms.

The organisation must verify payroll and tax configuration against current applicable Nepal requirements before using the system for official payroll.

---

# 88. Final Instruction to Claude

You are the senior full-stack engineer responsible for building this application.

Build **Sprasa HR** as a real, production-quality Node.js application.

Priorities:

1. Correctness
2. Security
3. Data integrity
4. Maintainability
5. Professional UI/UX
6. Scalability
7. Nepal-focused HR workflows

Do not build a superficial demo.

Build a proper working application with real:

- PostgreSQL database
- Prisma schema
- REST API
- Authentication
- RBAC
- Business logic
- Payroll engine
- Leave workflow
- Attendance system
- Reports
- Audit logs
- Responsive React frontend

Start by inspecting the existing project if one exists.

If no project exists, initialize the project using the architecture specified above.

Then implement the application phase by phase.

At every stage, keep the code runnable and fix errors before proceeding.
