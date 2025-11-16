import type { ErrorObject, ValidateFunction } from "ajv";
import type { RequestHandler } from "express";

export function formatAjvErrors(errors?: ErrorObject[] | null): string {
  if (!errors || errors.length === 0) {
    return "Invalid request body";
  }

  return errors
    .map((error) => {
      const path = error.instancePath || error.schemaPath || "body";
      const message = error.message ?? "is invalid";
      return `${path} ${message}`.trim();
    })
    .join(", ");
}

export function validateRequestBody<T>(
  validator: ValidateFunction<T>
): RequestHandler {
  return (req, res, next) => {
    if (!validator(req.body)) {
      return res.status(400).json({ error: formatAjvErrors(validator.errors) });
    }
    next();
  };
}
