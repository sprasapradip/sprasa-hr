import { Prisma } from '@prisma/client';

/** Round to 2 decimal places (half away from zero). */
export function round2(value: number): number {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

export function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

export const dec = (value: number) => new Prisma.Decimal(round2(value).toFixed(2));
