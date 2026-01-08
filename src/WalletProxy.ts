import { errAsync, okAsync, ResultAsync } from "neverthrow";
import Postmate from "postmate";

import {
  IAuthenticationResult,
  IGetAccountAddressResponse,
  IGetERC3009SignatureParams,
  IGetPermitSignatureParams,
  IRPCWrapperParams,
  IRPCWrapperReturn,
  ISignInParams,
  ISignInWithRecoveryPhraseParams,
  IStoreEncryptedEvmPrivateKeyParams,
  IStoreEncryptedEvmPrivateKeyResponse,
  rpcCallbackEventName,
} from "ProxyTypes";
import { ObjectUtils } from "utils/ObjectUtils";
import {
  ISignedERC3009TransferWithAuthorization,
  ISignedPermitTransfer,
} from "types/domain";
import { BaseError, ProxyError } from "types/errors";
import {
  AccountRecoveryId,
  AccountRecoveryPhrase,
  BigNumberString,
  EVMAccountAddress,
  JSONString,
  UnixTimestamp,
  UserId,
  Username,
} from "types/primitives";
import { ELocale } from "types/enum";

export class WalletProxy {
  protected child: Postmate.ParentAPI | null = null;
  protected rpcNonce = 0;
  protected rpcCallbacks = new Map<
    number,
    (result: IRPCWrapperReturn) => void
  >();

  public constructor() {}

  /**
   * Check if the WalletProxy is initialized and ready to use
   */
  public isInitialized(): boolean {
    return this.child !== null;
  }

  /**
   * Prepare iframe for WebAuthn operation to preserve user activation
   * This makes the iframe visible and focused so WebAuthn can work properly
   */
  private prepareIframeForWebAuthn(): {
    restore: () => void;
  } {
    if (
      !this.child?.frame ||
      !(this.child.frame instanceof HTMLIFrameElement)
    ) {
      return { restore: () => {} };
    }

    const frame = this.child.frame;
    const originalClasses = frame.className;
    const originalStyle = {
      display: frame.style.display,
      width: frame.style.width,
      height: frame.style.height,
      position: frame.style.position,
      opacity: frame.style.opacity,
      pointerEvents: frame.style.pointerEvents,
      zIndex: frame.style.zIndex,
    };

    // Remove 'hidden' class and make iframe technically "visible"
    frame.classList.remove("hidden");
    frame.style.display = "block";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.position = "fixed";
    frame.style.top = "0";
    frame.style.left = "0";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.style.zIndex = "-1";

    // Focus the iframe to preserve user activation
    try {
      if (frame.contentWindow) {
        frame.contentWindow.focus();
      }
      frame.focus();
    } catch (e) {
      console.warn("Could not focus iframe:", e);
    }

    // Return restore function
    return {
      restore: () => {
        if (this.child?.frame instanceof HTMLIFrameElement) {
          const f = this.child.frame;
          f.className = originalClasses;
          f.style.display = originalStyle.display;
          f.style.width = originalStyle.width;
          f.style.height = originalStyle.height;
          f.style.position = originalStyle.position;
          f.style.opacity = originalStyle.opacity;
          f.style.pointerEvents = originalStyle.pointerEvents;
          f.style.zIndex = originalStyle.zIndex;
        }
      },
    };
  }

  /**
   *
   * @param elementId ID of Element to inject frame into
   * @param locale Locale code (e.g., 'en', 'es', 'tr') for the wallet iframe URL
   * @param classListArray Classes to add to the iframe via classList, useful for styling.
   * @returns
   */
  public initialize(
    elementId: string,

    classListArray: string[] = [],
    locale: ELocale = ELocale.English,
  ): ResultAsync<void, ProxyError> {
    // Kick off the handshake with the iFrame
    const handshake = new Postmate({
      container: document.getElementById(elementId), // Element to inject frame into
      url: `https://immune-sheep-light.ngrok-free.app/${locale}/wallet`, // Page to load - Next.js route that renders the wallet iframe page with locale
      name: "wallet-iframe", // Set Iframe name attribute. Useful to get `window.name` in the child.
      classListArray: classListArray, //Classes to add to the iframe via classList, useful for styling.
    });

    // When parent <-> child handshake is complete, data may be requested from the child
    return ResultAsync.fromPromise(handshake, (e) => {
      return ProxyError.fromError(e as Error);
    }).map((child) => {
      this.child = child;

      // Setup the callback event listener
      this.child.on(rpcCallbackEventName, (data: JSONString) => {
        ObjectUtils.deserialize<IRPCWrapperReturn>(data).map((result) => {
          console.debug(
            `Received callback from Wallet for nonce ${result.callbackNonce}`,
            result,
          );
          // We should have a callback waiting for this data.
          const callback = this.rpcCallbacks.get(result.callbackNonce);

          // If there's no callback for this nonce, not much to do.
          if (callback == null) {
            // We just log this and ignore it.
            console.warn(
              `Received RPC callback event that is not expected.`,
              result,
            );
            return;
          }

          // We have a callback! We'll remove the callback from the map
          this.rpcCallbacks.delete(result.callbackNonce);

          // Then execute the callback
          callback(result);
        });
      });

      // Add WebAuthn permissions to the iframe for passkey support
      // These permissions are required for navigator.credentials.get() and create() to work in iframes
      if (child.frame && child.frame instanceof HTMLIFrameElement) {
        child.frame.setAttribute(
          "allow",
          "publickey-credentials-get publickey-credentials-create",
        );
      }

      //   // Fetch the height property in child.html and set it to the iFrames height
      //   child
      //     .get("height")
      //     .then((height) => (child.frame.style.height = `${height}px`));

      //   // Listen to a particular event from the child
      //   child.on("some-event", (data) => console.log(data)); // Logs "Hello, World!"
    });
  }

  /** getStatus returns whether or not the user has a valid session, and returns the user info. */
  public getStatus(): ResultAsync<IAuthenticationResult, ProxyError> {
    return this.rpcCall<IAuthenticationResult, object>("getStatus", {}).map(
      (result) => {
        return result;
      },
    );
  }

  public signIn(
    username: Username,
  ): ResultAsync<IAuthenticationResult, ProxyError> {
    return this.rpcCall<IAuthenticationResult, object>("signIn", {
      username: username,
    } satisfies ISignInParams);
  }

  public signInWithRecoveryPhrase(
    accountRecoveryId: AccountRecoveryId,
    accountRecoveryPhrase: AccountRecoveryPhrase,
  ): ResultAsync<IAuthenticationResult, ProxyError> {
    return this.rpcCall<IAuthenticationResult, object>(
      "signInWithRecoveryPhrase",
      {
        accountRecoveryId,
        accountRecoveryPhrase,
      } satisfies ISignInWithRecoveryPhraseParams,
    );
  }

  public storeEncryptedEvmPrivateKey(
    passphrase: string,
    userId: UserId,
  ): ResultAsync<IStoreEncryptedEvmPrivateKeyResponse, ProxyError> {
    return this.rpcCall<
      IStoreEncryptedEvmPrivateKeyResponse,
      IStoreEncryptedEvmPrivateKeyParams
    >("storeEncryptedEvmPrivateKey", {
      passphrase,
      userId,
    } satisfies IStoreEncryptedEvmPrivateKeyParams);
  }

  public getERC3009Signature(
    destinationAddress: EVMAccountAddress,
    amount: BigNumberString,
    validUntil: UnixTimestamp,
    validAfter: UnixTimestamp,
  ): ResultAsync<ISignedERC3009TransferWithAuthorization, ProxyError> {
    return this.rpcCall<
      ISignedERC3009TransferWithAuthorization,
      IGetERC3009SignatureParams
    >("getERC3009Signature", {
      destinationAddress,
      amount,
      validUntil,
      validAfter,
    } satisfies IGetERC3009SignatureParams);
  }

  public getPermitSignature(
    destinationAddress: EVMAccountAddress,
    amount: BigNumberString,
    nonce: BigNumberString,
    deadlineSeconds: number,
  ): ResultAsync<ISignedPermitTransfer, ProxyError> {
    return this.rpcCall<ISignedPermitTransfer, IGetPermitSignatureParams>(
      "getPermitSignature",
      {
        destinationAddress,
        amount,
        nonce,
        deadlineSeconds,
      } satisfies IGetPermitSignatureParams,
    );
  }

  public signOut(): ResultAsync<void, ProxyError> {
    return this.rpcCall<void, object>("signOut", {});
  }

  public getAccountAddress(): ResultAsync<EVMAccountAddress, ProxyError> {
    return this.rpcCall<IGetAccountAddressResponse, object>(
      "getAccountAddress",
      {},
    ).map((result) => {
      return result.accountAddress;
    });
  }

  protected rpcCall<TReturn, TParams>(
    eventName: string,
    params: TParams,
  ): ResultAsync<TReturn, ProxyError> {
    if (this.child == null) {
      return errAsync(new ProxyError(new Error("WalletProxy not initialized")));
    }

    // Preserve user activation for WebAuthn in iframe
    // This is critical: WebAuthn requires user activation, and mobile browsers
    // are strict about preserving it through postMessage
    const { restore } = this.prepareIframeForWebAuthn();

    // Setup a callback
    return ResultAsync.fromPromise(
      new Promise<TReturn>((resolve, reject) => {
        const callbackNonce = this.rpcNonce++;
        this.rpcCallbacks.set(callbackNonce, (result: IRPCWrapperReturn) => {
          // Check if it was successful or not
          if (!result.success) {
            // The result is an error!
            const resultError = ObjectUtils.deserializeUnsafe<BaseError>(
              result.result,
            );
            reject(resultError);
          } else {
            // Success!
            const resultObj = ObjectUtils.deserializeUnsafe<TReturn>(
              result.result,
            );
            resolve(resultObj);
          }
        });

        // Call the signIn function in the child
        this.child!.call(
          eventName,
          ObjectUtils.serialize({
            eventName,
            callbackNonce,
            params,
          } satisfies IRPCWrapperParams<TParams>),
        );
      }),
      (e) => {
        return ProxyError.fromError(e as BaseError);
      },
    ).map((result) => {
      // Restore iframe state after a delay (allows WebAuthn prompt to appear)
      restore();

      return result;
    });
  }

  /**
   * Prepare iframe for private key display
   * Makes the iframe visible as a full-screen overlay
   */
  private prepareIframeForDisplay(): {
    restore: () => void;
  } {
    if (
      !this.child?.frame ||
      !(this.child.frame instanceof HTMLIFrameElement)
    ) {
      return { restore: () => {} };
    }

    const frame = this.child.frame;
    const container = frame.parentElement;
    const originalClasses = frame.className;
    const originalContainerClasses = container?.className || "";
    const originalStyle = {
      display: frame.style.display,
      width: frame.style.width,
      height: frame.style.height,
      position: frame.style.position,
      top: frame.style.top,
      left: frame.style.left,
      right: frame.style.right,
      bottom: frame.style.bottom,
      opacity: frame.style.opacity,
      pointerEvents: frame.style.pointerEvents,
      zIndex: frame.style.zIndex,
    };
    const originalContainerStyle = container
      ? {
          display: container.style.display,
          position: container.style.position,
          zIndex: container.style.zIndex,
        }
      : null;

    // Make container visible and positioned correctly
    // Need to override Tailwind's hidden class which uses !important
    if (container) {
      container.classList.remove("hidden");
      // Use setProperty with important flag to override Tailwind's hidden class
      container.style.setProperty("display", "block", "important");
      container.style.setProperty("position", "fixed", "important");
      container.style.setProperty("top", "0", "important");
      container.style.setProperty("left", "0", "important");
      container.style.setProperty("width", "100vw", "important");
      container.style.setProperty("height", "100vh", "important");
      container.style.setProperty("z-index", "9999", "important");
      container.style.setProperty("pointer-events", "none", "important");
    }

    // Make iframe visible as full-screen overlay
    // Use setProperty with important flag to override Tailwind's hidden class
    frame.classList.remove("hidden");
    frame.style.setProperty("display", "block", "important");
    frame.style.setProperty("width", "100vw", "important");
    frame.style.setProperty("height", "100vh", "important");
    frame.style.setProperty("position", "fixed", "important");
    frame.style.setProperty("top", "0", "important");
    frame.style.setProperty("left", "0", "important");
    frame.style.setProperty("right", "0", "important");
    frame.style.setProperty("bottom", "0", "important");
    frame.style.setProperty("opacity", "1", "important");
    frame.style.setProperty("pointer-events", "auto", "important");
    frame.style.setProperty("z-index", "9999", "important");
    frame.style.setProperty("border", "none", "important");
    frame.style.setProperty("margin", "0", "important");
    frame.style.setProperty("padding", "0", "important");

    // Return restore function
    return {
      restore: () => {
        if (this.child?.frame instanceof HTMLIFrameElement) {
          const f = this.child.frame;
          f.className = originalClasses;
          f.style.display = originalStyle.display;
          f.style.width = originalStyle.width;
          f.style.height = originalStyle.height;
          f.style.position = originalStyle.position;
          f.style.top = originalStyle.top;
          f.style.left = originalStyle.left;
          f.style.right = originalStyle.right;
          f.style.bottom = originalStyle.bottom;
          f.style.opacity = originalStyle.opacity;
          f.style.pointerEvents = originalStyle.pointerEvents;
          f.style.zIndex = originalStyle.zIndex;
          f.style.border = "";
          f.style.margin = "";
          f.style.padding = "";
        }
        if (container && originalContainerStyle) {
          container.className = originalContainerClasses;
          container.style.display = originalContainerStyle.display;
          container.style.position = originalContainerStyle.position;
          container.style.zIndex = originalContainerStyle.zIndex;
        }
      },
    };
  }

  public displayPrivateKey(onClose: () => void): ResultAsync<void, ProxyError> {
    if (this.child == null) {
      return errAsync(new ProxyError(new Error("WalletProxy not initialized")));
    }

    // Prepare iframe to be visible
    const { restore } = this.prepareIframeForDisplay();

    // Setup an event listener for the private key display closed event
    // Use a one-time listener pattern since Postmate doesn't have .off()
    let hasClosed = false;
    const handleClose = () => {
      if (hasClosed) return;
      hasClosed = true;
      restore();
      onClose();
    };

    this.child!.on("PrivateKeyDisplayClosed", handleClose);

    // Call displayPrivateKey in the iframe
    this.child.call("displayPrivateKey");

    return okAsync(undefined);
  }
}
