import { EHttpStatusCode } from "types/enum";
import { BaseError } from "types/errors/BaseError";

// Branded error types to ensure they're distinguishable
export class AjaxError extends BaseError {
  readonly errorCode = "ERR_AJAX" as const;
  readonly errorType = "AjaxError";
  readonly httpStatus = EHttpStatusCode.INTERNAL_SERVER_ERROR;

  constructor(src: Error) {
    super(src, "AjaxError");
  }

  // Static factory method
  static fromError(src: Error): AjaxError {
    return new AjaxError(src);
  }

  // Static type guard method
  static isError(error: unknown): error is AjaxError {
    return error instanceof AjaxError;
  }
}
