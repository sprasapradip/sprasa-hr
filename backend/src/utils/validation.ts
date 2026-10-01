import { z } from 'zod';
import { DATE_REGEX, TIME_REGEX } from './dates';

/** Nepali mobile (98/97/96 + 8 digits) or landline, optional +977 prefix. */
export const NEPAL_PHONE_REGEX = /^(\+?977[-\s]?)?(9[678]\d{8}|0?\d{1,2}[-\s]?\d{6,7})$/;

export const zDate = z.string().regex(DATE_REGEX, 'Use YYYY-MM-DD');
export const zTime = z.string().regex(TIME_REGEX, 'Use HH:mm (24-hour)');
export const zUuid = z.string().uuid();
export const zPhone = z.string().trim().regex(NEPAL_PHONE_REGEX, 'Enter a valid Nepali phone number');
export const zMoney = z.coerce.number().min(0).max(1_000_000_000);

/** Treat empty strings and null from forms as "not provided". */
export const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

/** Like optional(), but keeps explicit null so a field can be cleared on update. */
export const nullable = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? null : v), schema.nullable().optional());
