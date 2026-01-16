import { ResultAsync } from "neverthrow";

import {
  IAuthenticationResult,
} from "ProxyTypes";
import {
  ISignedERC3009TransferWithAuthorization,
  ISignedPermitTransfer,
} from "types/domain";
import { AjaxError, ProxyError } from "types/errors";
import {
  BigNumberString,
  EVMAccountAddress,
  UnixTimestamp,
  Username,
} from "types/primitives";
import { ELocale } from "types/enum";

export interface IOneShotPay {
  /**
   * Check if the WalletProxy is initialized and ready to use
   */
  isInitialized(): boolean;

  /**
   *
   * @param elementId ID of Element to inject frame into
   * @param locale Locale code (e.g., 'en', 'es', 'tr') for the wallet iframe URL
   * @param classListArray Classes to add to the iframe via classList, useful for styling.
   * @returns
   */
  initialize(
    elementId: string,
    classListArray?: string[],
    locale?: ELocale,
  ): ResultAsync<void, ProxyError>;

  /** getStatus returns whether or not the user has a valid session, and returns the user info. */
  getStatus(): ResultAsync<IAuthenticationResult, ProxyError>;

  signIn(
    username: Username,
  ): ResultAsync<IAuthenticationResult, ProxyError>;

  getERC3009Signature(
    recipient: string,
    destinationAddress: EVMAccountAddress,
    amount: BigNumberString,
    validUntil: UnixTimestamp,
    validAfter: UnixTimestamp,
  ): ResultAsync<ISignedERC3009TransferWithAuthorization, ProxyError>;

  getPermitSignature(
    recipient: string,
    destinationAddress: EVMAccountAddress,
    amount: BigNumberString,
    nonce: BigNumberString,
    deadlineSeconds: number,
  ): ResultAsync<ISignedPermitTransfer, ProxyError>;

  signOut(): ResultAsync<void, ProxyError>;

  getAccountAddress(): ResultAsync<EVMAccountAddress, ProxyError>;

  /**
   * Show the wallet iframe with full modal styling
   * Uses the same styling as prepareIframeForDisplay()
   */
  show(): void;

  /**
   * Hide the wallet iframe
   * Restores the iframe to its original state
   */
  hide(): void;

  /**
   * Get the current visibility state of the wallet iframe
   * @returns true if the iframe is currently visible, false otherwise
   */
  getVisible(): boolean;

  /**
   * x402-enabled fetch wrapper.
   *
   * Performs a normal fetch first. If the response is HTTP 402 and includes x402 payment requirements,
   * this method will ONLY support the `exact` scheme with USDC on Base (eip155:8453 or eip155:84532).
   *
   * If supported, it requests an EIP-3009 (ERC-3009) signature from the embedded wallet and retries
   * the request with a `PAYMENT-SIGNATURE` header containing base64(JSON(PaymentPayload)).
   */
  x402Fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): ResultAsync<Response, AjaxError | ProxyError>;
}
