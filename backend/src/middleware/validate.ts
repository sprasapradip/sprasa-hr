import type { Request } from 'express';
import type { z, ZodTypeAny } from 'zod';

/**
 * Parse and validate part of a request with a Zod schema. Unknown keys are stripped by
 * z.object() by default, which prevents mass assignment of fields the schema doesn't list.
 * ZodErrors are turned into 422 responses by the error handler.
 */
export function body<T extends ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.body ?? {});
}

export function query<T extends ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.query ?? {});
}

export function params<T extends ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.params ?? {});
}
