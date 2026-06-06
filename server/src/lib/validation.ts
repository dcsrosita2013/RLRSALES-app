import { z } from 'zod';

// Optional text field: blank strings become null so we don't store empty values.
export const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(1000).nullish(),
);

export const requiredString = z.string().trim().min(1, 'Required').max(255);

// Money/quantity input: accepts number or numeric string, must be >= 0.
export const nonNegativeNumber = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v) : v),
  z.number({ invalid_type_error: 'Must be a number' }).min(0, 'Must be 0 or more'),
);
