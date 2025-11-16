import { ValidateFunction } from "ajv";
import { RequestHandler } from "express";

export function validateBody<T>(validator: ValidateFunction<T>): RequestHandler {
  return (req, res, next) => {
    if (!validator(req.body)) {
      return res.status(400).json({
        error: "Invalid request body",
        details: validator.errors ?? [],
      });
    }
    next();
  };
}
