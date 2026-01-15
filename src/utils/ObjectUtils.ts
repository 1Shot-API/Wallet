import { errAsync, okAsync, ResultAsync } from "neverthrow";
import stringify from "safe-stable-stringify";

import { ValidationError } from "types/errors";
import { JSONString } from "types/primitives";

export class ObjectUtils {
  // Taken from https://stackoverflow.com/questions/27936772/how-to-deep-merge-instead-of-shallow-merge
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static mergeDeep<T = unknown>(...objects: any[]): T {
    const isObject = (obj: unknown) => obj && typeof obj === "object";

    return objects.reduce((prev, obj) => {
      Object.keys(obj).forEach((key) => {
        const pVal = prev[key];
        const oVal = obj[key];

        if (Array.isArray(pVal) && Array.isArray(oVal)) {
          prev[key] = pVal.concat(...oVal);
        } else if (isObject(pVal) && isObject(oVal)) {
          prev[key] = ObjectUtils.mergeDeep(pVal, oVal);
        } else {
          prev[key] = oVal;
        }
      });

      return prev;
    }, {});
  }

  /**
   * This method is an improvement on JSON.stringify. It uses a stable stringify method so that objects will always generate the same
   * hash, and it support a few non-serializeable types that are useful, such as BigInt, Map, and Set. The output is correct JSON
   * but uses markup to support the non-native types and must be deserialized with the deserialize() method to get the same object
   * back.
   * @param obj
   * @returns
   */
  static serialize(obj: unknown): JSONString {
    return JSONString(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stringify(obj, (_key: any, value: any) => {
        if (value instanceof Error) {
          return {
            dataType: "Error",
            value: {
              name: value.name || "Error",
              message: value.message || "Unknown error",
              stack: value.stack || undefined,
            },
          };
        } else if (value instanceof Map) {
          return {
            dataType: "Map",
            value: Array.from(value.entries()), // or with spread: value: [...value]
          };
        } else if (value instanceof Set) {
          return {
            dataType: "Set",
            value: [...value],
          };
        } else if (value instanceof BigInt) {
          return {
            dataType: "BigInt",
            value: value.toString(),
          };
        } else if (typeof value == "bigint") {
          return {
            dataType: "bigint",
            value: BigInt(value).toString(),
          };
        } else {
          return value;
        }
      }) as string,
    );
  }

  static deserialize<T = Record<string, unknown>>(
    json: JSONString,
  ): ResultAsync<T, ValidationError> {
    return ResultAsync.fromPromise(Promise.resolve(JSON.parse(json)), (e) =>
      ValidationError.fromError(e as Error),
    ).andThen((parsed) => {
      // Handle special data types
      const processValue = (value: unknown): unknown => {
        if (
          typeof value === "object" &&
          value !== null &&
          "dataType" in value &&
          "value" in value
        ) {
          const dataType = (value as { dataType: string }).dataType;
          const dataValue = (value as { value: unknown }).value;

          if (dataType === "Error") {
            const errorData = dataValue as {
              name?: string;
              message?: string;
              stack?: string;
            };
            const error = new Error(errorData.message || "Unknown error");
            error.name = errorData.name || "Error";
            if (errorData.stack) {
              error.stack = errorData.stack;
            }
            return error;
          } else if (dataType === "Map") {
            return new Map(dataValue as [unknown, unknown][]);
          } else if (dataType === "Set") {
            return new Set(dataValue as unknown[]);
          } else if (dataType === "BigInt" || dataType === "bigint") {
            return BigInt(dataValue as string);
          }
        }

        if (Array.isArray(value)) {
          return value.map(processValue);
        } else if (value && typeof value === "object") {
          const processed: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(value)) {
            processed[key] = processValue(val);
          }
          return processed;
        }

        return value;
      };

      const processed = processValue(parsed);
      return okAsync(processed as T);
    });
  }

  static deserializeUnsafe<T = Record<string, unknown>>(json: JSONString): T {
    return JSON.parse(json, (_key, value) => {
      if (typeof value === "object" && value !== null) {
        if (value.dataType === "Error") {
          const errorData = value.value as {
            name?: string;
            message?: string;
            stack?: string;
          };
          const error = new Error(errorData.message || "Unknown error");
          error.name = errorData.name || "Error";
          if (errorData.stack) {
            error.stack = errorData.stack;
          }
          return error;
        } else if (value.dataType === "Map") {
          return new Map(value.value);
        } else if (value.dataType === "Set") {
          return new Set(value.value);
        } else if (value.dataType === "BigInt") {
          return BigInt(value.value);
        } else if (value.dataType === "bigint") {
          return BigInt(value.value);
        }
      }
      return value;
    });
  }

  /**
   * This object will convert an object with a Prototype into a generic object. This can be done by nulling the prototype but that's not
   * really possible in Typescript, so we we do it differently by cloning the object. This means this is also one way of doing a deep
   * copy of an object, but it will fail and instanceof() check.
   * @param obj
   * @returns
   */
  static toGenericObject<T = Record<string, unknown>>(
    obj: unknown,
  ): ResultAsync<T, ValidationError> {
    return ObjectUtils.deserialize(ObjectUtils.serialize(obj));
  }

  static removeNullValues<T>(array: (T | null | undefined)[]): T[] {
    function notEmpty<T>(value: T | null | undefined): value is T {
      if (value === null || value === undefined) return false;
      // const _testConversion: T = value;
      return true;
    }
    return array.filter(notEmpty);
  }

  static getEnumKeyByValue<T extends Record<string, string | number>>(
    enumObj: T,
    value: number,
  ): string {
    return (
      Object.keys(enumObj).find((key) => enumObj[key] === value) || "Undefined"
    );
  }

  static getEnumKeyByValueSafely<T extends Record<string, string | number>>(
    enumObj: T,
    value: number,
  ): string {
    // Filter out numeric keys like "0", "1"
    const stringKeys = Object.keys(enumObj).filter((key) => isNaN(Number(key)));
    for (const key of stringKeys) {
      if (enumObj[key] === value) {
        return key;
      }
    }
    return "Undefined";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static convertBigIntsToStrings<T>(input: T): any {
    if (typeof input === "bigint") {
      return input.toString();
    }

    if (Array.isArray(input)) {
      return input.map((i) => {
        return this.convertBigIntsToStrings(i);
      });
    }

    if (input && typeof input === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        result[key] = this.convertBigIntsToStrings(value);
      }
      return result;
    }

    return input;
  }
}
