import Ajv, { JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";

export const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function compileSchema<T>(schema: JSONSchemaType<T>) {
  return ajv.compile<T>(schema);
}

export type { JSONSchemaType };
