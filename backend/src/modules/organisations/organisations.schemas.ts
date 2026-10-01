import { z } from 'zod';
import { nullable, optional, zDate } from '../../utils/validation';

const orgFields = {
  name: z.string().trim().min(2).max(150),
  legalName: nullable(z.string().trim().max(200)),
  registrationNumber: nullable(z.string().trim().max(60)),
  panNumber: nullable(z.string().trim().regex(/^\d{9}$/, 'PAN must be 9 digits')),
  address: nullable(z.string().trim().max(250)),
  province: nullable(z.string().trim().max(60)),
  district: nullable(z.string().trim().max(60)),
  municipality: nullable(z.string().trim().max(100)),
  phone: nullable(z.string().trim().max(40)),
  email: nullable(z.string().trim().email()),
  website: nullable(z.string().trim().url()),
  timezone: optional(z.string().max(60)),
  currency: optional(z.string().length(3)),
  fiscalYear: optional(z.string().regex(/^\d{4}\/\d{2}$/, 'Use a format like 2083/84')),
  fiscalYearStart: nullable(zDate),
  dateFormat: optional(z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'])),
  workingDays: optional(z.array(z.number().int().min(1).max(7)).min(1).max(7)),
  defaultShiftId: nullable(z.string().uuid()),
};

export const updateOrganisationSchema = z.object(orgFields).partial();

export const createOrganisationSchema = z.object({
  ...orgFields,
  admin: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email(),
  }),
});

export const orgStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
