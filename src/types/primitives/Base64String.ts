import { type Brand, make } from "ts-brand";

/**
 * This is base64 encoded string
 */
export type Base64String = Brand<string, "Base64String">;
export const Base64String = make<Base64String>();
