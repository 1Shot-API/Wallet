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
  rpcCallbackEventName,
} from "ProxyTypes";
import { ObjectUtils } from "utils/ObjectUtils";
import {
  ISignedERC3009TransferWithAuthorization,
  ISignedPermitTransfer,
} from "types/domain";
import { AjaxError, BaseError, ProxyError } from "types/errors";
import {
  BigNumberString,
  EVMAccountAddress,
  JSONString,
  UnixTimestamp,
  Username,
} from "types/primitives";
import { ELocale } from "types/enum";
import { IOneShotPay } from "IOneShotPay";
import {
  X402PaymentPayloadV2ExactEvm,
  X402PaymentRequirements,
  x402Base64EncodeUtf8,
  x402GetChainIdFromNetwork,
  x402IsUsdcOnBase,
  x402NormalizeAcceptedPayments,
  x402ParseJsonOrBase64Json,
  x402ResolveRequestUrl,
} from "utils/x402Utils";

export class OneShotPay implements IOneShotPay {
  protected child: Postmate.ParentAPI | null = null;
  protected rpcNonce = 0;
  protected rpcCallbacks = new Map<
    number,
    (result: IRPCWrapperReturn) => void
  >();
  protected containerElement: HTMLElement | null = null;
  protected displayRestore: (() => void) | null = null;
  protected isVisible: boolean = false;

  public constructor() {}

  /**
   * Check if the WalletProxy is initialized and ready to use
   */
  public isInitialized(): boolean {
    return this.child !== null;
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
      url: `https://1shotpay.com/${locale}/wallet`, // Page to load - Next.js route that renders the wallet iframe page with locale
      name: "wallet-iframe", // Set Iframe name attribute. Useful to get `window.name` in the child.
      classListArray: classListArray, //Classes to add to the iframe via classList, useful for styling.
    });

    // When parent <-> child handshake is complete, data may be requested from the child
    return ResultAsync.fromPromise(handshake, (e) => {
      return ProxyError.fromError(e as Error);
    }).map((child) => {
      console.log("Handshake with 1ShotPay iframe complete.");
      this.child = child;
      // Store reference to container element for modal styling
      const container = document.getElementById(elementId);
      if (container) {
        this.containerElement = container;
      }

      // Add WebAuthn permissions to the iframe for passkey support
      // These permissions are required for navigator.credentials.get() and create() to work in iframes
      // Note: The allow attribute should already be set by Postmate when creating the iframe,
      // but we set it again here as a fallback and to ensure it's present after handshake
      if (child.frame && child.frame instanceof HTMLIFrameElement) {
        const allowValue = "publickey-credentials-get; publickey-credentials-create";
        // child.frame.setAttribute("allow", allowValue);
        
        // Verify the attribute was set correctly
        const actualAllow = child.frame.getAttribute("allow");
        if (actualAllow !== allowValue) {
          console.warn(
            `WebAuthn allow attribute mismatch. Expected: "${allowValue}", Got: "${actualAllow}"`
          );
        } else {
          console.log("WebAuthn permissions verified on iframe:", actualAllow);
        }
      }
      else {
        console.warn("Could not add WebAuthn permissions to iframe. Frame is not an HTMLIFrameElement.");
      }

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

      // Setup listener for closeFrame event from the iframe
      this.child.on("closeFrame", () => {
        console.debug("Received closeFrame event from Wallet iframe");
        this.hide();
      });

      // Setup listener for registrationRequired event from the iframe
      this.child.on("registrationRequired", (url: string) => {
        console.debug("Received registrationRequired event from Wallet iframe:", url);
        // Close the frame when registration is required
        this.hide();
        if (url && typeof url === "string") {
          window.open(url, "_blank", "noopener,noreferrer");
        } else {
          console.warn("registrationRequired event received with invalid URL:", url);
        }
      });

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

  public getERC3009Signature(
    recipient: string,
    destinationAddress: EVMAccountAddress,
    amount: BigNumberString,
    validUntil: UnixTimestamp,
    validAfter: UnixTimestamp,
  ): ResultAsync<ISignedERC3009TransferWithAuthorization, ProxyError> {
    return this.rpcCall<
      ISignedERC3009TransferWithAuthorization,
      IGetERC3009SignatureParams
    >(
      "getERC3009Signature",
      {
        recipient,
        destinationAddress,
        amount,
        validUntil,
        validAfter,
      } satisfies IGetERC3009SignatureParams,
      true, // requireInteraction: display iframe for user interaction
    );
  }

  public getPermitSignature(
    recipient: string,
    destinationAddress: EVMAccountAddress,
    amount: BigNumberString,
    nonce: BigNumberString,
    deadlineSeconds: number,
  ): ResultAsync<ISignedPermitTransfer, ProxyError> {
    return this.rpcCall<ISignedPermitTransfer, IGetPermitSignatureParams>(
      "getPermitSignature",
      {
        recipient,
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

  /**
   * Show the wallet iframe with full modal styling
   * Uses the same styling as prepareIframeForDisplay()
   */
  public show(): void {
    // If already shown, restore first to avoid stacking styles
    if (this.displayRestore) {
      this.displayRestore();
      this.displayRestore = null;
    }

    // Prepare iframe for display and store the restore function
    const { restore } = this.prepareIframeForDisplay();
    this.displayRestore = restore;
    this.isVisible = true;
  }

  /**
   * Hide the wallet iframe
   * Restores the iframe to its original state
   */
  public hide(): void {
    if (this.displayRestore) {
      // If we have a restore function from show(), use it
      this.displayRestore();
      this.displayRestore = null;
    } else if (this.containerElement && this.isVisible) {
      // If the iframe was shown via RPC call (no displayRestore), hide it directly
      // by resetting the container and iframe styles
      const container = this.containerElement;
      const frame = this.child?.frame;
      
      // Hide container
      container.style.setProperty("display", "none", "important");
      container.classList.add("hidden");
      
      // Remove backdrop if it exists
      const backdrop = container.querySelector(".wallet-modal-backdrop");
      if (backdrop && backdrop.parentNode) {
        backdrop.parentNode.removeChild(backdrop);
      }
      
      // Reset container styles
      container.style.removeProperty("position");
      container.style.removeProperty("top");
      container.style.removeProperty("left");
      container.style.removeProperty("width");
      container.style.removeProperty("height");
      container.style.removeProperty("z-index");
      container.style.removeProperty("align-items");
      container.style.removeProperty("justify-content");
      
      // Reset iframe styles if it exists
      if (frame && frame instanceof HTMLIFrameElement) {
        frame.style.removeProperty("display");
        frame.style.removeProperty("width");
        frame.style.removeProperty("max-width");
        frame.style.removeProperty("height");
        frame.style.removeProperty("max-height");
        frame.style.removeProperty("position");
        frame.style.removeProperty("z-index");
        frame.style.removeProperty("opacity");
        frame.style.removeProperty("pointer-events");
        frame.style.removeProperty("border");
        frame.style.removeProperty("border-radius");
        frame.style.removeProperty("box-shadow");
        frame.style.removeProperty("margin");
        frame.style.removeProperty("padding");
        frame.classList.add("hidden");
      }
    }
    this.isVisible = false;
  }

  /**
   * Get the current visibility state of the wallet iframe
   * @returns true if the iframe is currently visible, false otherwise
   */
  public getVisible(): boolean {
    return this.isVisible;
  }

  /**
   * x402-enabled fetch wrapper.
   *
   * Performs a normal fetch first. If the response is HTTP 402 and includes x402 payment requirements,
   * this method will ONLY support the `exact` scheme with USDC on Base mainnet (eip155:8453).
   *
   * If supported, it requests an EIP-3009 (ERC-3009) signature from the embedded wallet and retries
   * the request with a `PAYMENT-SIGNATURE` header containing base64(JSON(PaymentPayload)).
   */
  public x402Fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): ResultAsync<Response, AjaxError | ProxyError> {
    const doFetch = (headersOverride?: Headers): ResultAsync<Response, AjaxError> => {
      const nextInit: RequestInit = { ...(init ?? {}) };

      const headers = new Headers(init?.headers ?? undefined);
      if (headersOverride) {
        headersOverride.forEach((value, key) => headers.set(key, value));
      }
      nextInit.headers = headers;

      return ResultAsync.fromPromise(fetch(input, nextInit), (e) => AjaxError.fromError(e as Error));
    };

    return doFetch().andThen(
      (initialResponse) => {
        if (initialResponse.status !== 402) {
          return okAsync(initialResponse);
        }

        const paymentRequiredHeader =
          initialResponse.headers.get("payment-required") ??
          initialResponse.headers.get("PAYMENT-REQUIRED");

        if (!paymentRequiredHeader) {
          return errAsync(
            new AjaxError(
              new Error(
                "Received HTTP 402 but missing PAYMENT-REQUIRED header for x402.",
              ),
            ),
          );
        }

        let parsed: unknown;
        try {
          parsed = x402ParseJsonOrBase64Json(paymentRequiredHeader);
        } catch (e) {
          return errAsync(
            new AjaxError(
              new Error(
                `Failed to parse PAYMENT-REQUIRED header for x402: ${(e as Error).message}`,
              ),
            ),
          );
        }

        const req = parsed as X402PaymentRequirements;
        const accepted = x402NormalizeAcceptedPayments(req);
        const exact = accepted.find((p) => (p.scheme ?? "").toLowerCase() === "exact");

        if (!exact) {
          return errAsync(
            new AjaxError(
              new Error("x402 endpoint does not offer the Exact scheme (required)."),
            ),
          );
        }

        const network = exact.network;
        const amount = exact.amount;
        const asset = exact.asset;
        const payTo = exact.payTo;

        if (!network || !amount || !asset || !payTo) {
          return errAsync(
            new AjaxError(
              new Error(
                "x402 PAYMENT-REQUIRED header missing one of: network, amount, asset, payTo.",
              ),
            ),
          );
        }

        const chainId = x402GetChainIdFromNetwork(network);
        if (chainId == null) {
          return errAsync(
            new AjaxError(
              new Error(
                `Unsupported x402 network "${network}". Only eip155:<chainId> is supported.`,
              ),
            ),
          );
        }

        if (!x402IsUsdcOnBase(chainId, asset)) {
          return errAsync(
            new AjaxError(
              new Error(
                `Unsupported x402 payment. Only USDC on Base is supported (got asset=${asset}, network=${network}).`,
              ),
            ),
          );
        }

        // Enforce asset transfer method (Exact + EIP-3009)
        const extra = (exact.extra ?? {}) as Record<string, unknown>;
        const method =
          (extra["assetTransferMethod"] as string | undefined) ??
          ((extra as Record<string, unknown>)["asset_transfer_method"] as
            | string
            | undefined);
        if (method && method.toLowerCase() !== "eip3009") {
          return errAsync(
            new AjaxError(
              new Error(
                `Unsupported x402 assetTransferMethod "${method}". Only "eip3009" is supported.`,
              ),
            ),
          );
        }

        // Signature validity window
        const maxTimeoutSeconds =
          typeof exact.maxTimeoutSeconds === "number" ? exact.maxTimeoutSeconds : 60;
        const nowSeconds = Math.floor(Date.now() / 1000);
        const validAfter = UnixTimestamp(nowSeconds);
        const validUntil = UnixTimestamp(nowSeconds + maxTimeoutSeconds);

        // Use request URL as "recipient" string for wallet UX
        const requestUrl = x402ResolveRequestUrl(input);

        // Generate the ERC-3009 signature via the embedded wallet
        return this.getERC3009Signature(
          requestUrl,
          payTo,
          amount,
          validUntil,
          validAfter,
        ).andThen((signed: ISignedERC3009TransferWithAuthorization) => {
          const paymentPayload: X402PaymentPayloadV2ExactEvm = {
            x402Version: typeof req.x402Version === "number" ? req.x402Version : 2,
            resource: {
              url: (req.resource?.url ?? requestUrl) as unknown as string,
              ...(req.resource?.description ? { description: req.resource.description } : {}),
              ...(req.resource?.mimeType ? { mimeType: req.resource.mimeType } : {}),
            },
            accepted: {
              scheme: "exact",
              network,
              amount,
              asset,
              payTo,
              maxTimeoutSeconds,
              ...(Object.keys(extra).length ? { extra } : {}),
            },
            payload: {
              signature: signed.signature,
              authorization: {
                from: signed.from,
                to: signed.to,
                value: signed.value,
                validAfter: signed.validAfter,
                validBefore: signed.validBefore,
                nonce: signed.nonce,
              },
            },
          };

          const encoded = x402Base64EncodeUtf8(JSON.stringify(paymentPayload));
          const headersOverride = new Headers();
          headersOverride.set("PAYMENT-SIGNATURE", encoded);

          return doFetch(headersOverride);
        });
      },
    );
  }

  protected rpcCall<TReturn, TParams>(
    eventName: string,
    params: TParams,
    requireInteraction: boolean = false,
  ): ResultAsync<TReturn, ProxyError> {
    if (this.child == null) {
      return errAsync(new ProxyError(new Error("WalletProxy not initialized")));
    }

    // Prepare iframe based on whether interaction is required
    const { restore } = requireInteraction
      ? this.prepareIframeForDisplay()
      : this.prepareIframeForWebAuthn();
    
    // Track visibility when iframe is shown for interaction
    if (requireInteraction) {
      this.isVisible = true;
    }

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

        // Call the function in the child
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
    )
      .map((result) => {
        // Restore iframe state after completion
        restore();
        if (requireInteraction) {
          this.isVisible = false;
        }
        return result;
      })
      .mapErr((error) => {
        // Restore iframe state even on error
        restore();
        if (requireInteraction) {
          this.isVisible = false;
        }
        return error;
      });
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
   * Prepare iframe for display as a modal dialog
   * Creates a backdrop and centers the iframe as a modal
   */
  private prepareIframeForDisplay(): {
    restore: () => void;
  } {
    if (
      !this.child?.frame ||
      !(this.child.frame instanceof HTMLIFrameElement) ||
      !this.containerElement
    ) {
      return { restore: () => {} };
    }

    const frame = this.child.frame;
    const container = this.containerElement;

    // Store original styles for restoration
    const originalFrameClasses = frame.className;
    const originalContainerClasses = container.className;
    const originalFrameStyle = {
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
      border: frame.style.border,
      borderRadius: frame.style.borderRadius,
      margin: frame.style.margin,
      padding: frame.style.padding,
      boxShadow: frame.style.boxShadow,
      transform: frame.style.transform,
    };
    const originalContainerStyle = {
      display: container.style.display,
      position: container.style.position,
      top: container.style.top,
      left: container.style.left,
      width: container.style.width,
      height: container.style.height,
      zIndex: container.style.zIndex,
      backgroundColor: container.style.backgroundColor,
      pointerEvents: container.style.pointerEvents,
    };

    // Check if backdrop already exists
    let backdrop = container.querySelector(
      ".wallet-modal-backdrop",
    ) as HTMLElement;
    const backdropCreated = !backdrop;

    // Create backdrop if it doesn't exist
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "wallet-modal-backdrop";
      container.insertBefore(backdrop, frame);
    }

    // Style container as modal backdrop
    container.classList.remove("hidden");
    container.style.setProperty("display", "flex", "important");
    container.style.setProperty("position", "fixed", "important");
    container.style.setProperty("top", "0", "important");
    container.style.setProperty("left", "0", "important");
    container.style.setProperty("width", "100vw", "important");
    container.style.setProperty("height", "100vh", "important");
    container.style.setProperty("z-index", "9999", "important");
    container.style.setProperty("align-items", "center", "important");
    container.style.setProperty("justify-content", "center", "important");

    // Style backdrop
    backdrop.style.setProperty("position", "absolute", "important");
    backdrop.style.setProperty("top", "0", "important");
    backdrop.style.setProperty("left", "0", "important");
    backdrop.style.setProperty("width", "100%", "important");
    backdrop.style.setProperty("height", "100%", "important");
    backdrop.style.setProperty("background-color", "rgba(0, 0, 0, 0.5)", "important");
    backdrop.style.setProperty("z-index", "1", "important");

    // Style iframe as centered modal dialog
    frame.classList.remove("hidden");
    frame.style.setProperty("display", "block", "important");
    frame.style.setProperty("width", "90vw", "important");
    frame.style.setProperty("max-width", "600px", "important");
    frame.style.setProperty("height", "80vh", "important");
    frame.style.setProperty("max-height", "800px", "important");
    frame.style.setProperty("position", "relative", "important");
    frame.style.setProperty("z-index", "2", "important");
    frame.style.setProperty("opacity", "1", "important");
    frame.style.setProperty("pointer-events", "auto", "important");
    frame.style.setProperty("border", "none", "important");
    frame.style.setProperty("border-radius", "8px", "important");
    frame.style.setProperty("box-shadow", "0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)", "important");
    frame.style.setProperty("margin", "0", "important");
    frame.style.setProperty("padding", "0", "important");

    // Return restore function
    return {
      restore: () => {
        if (this.child?.frame instanceof HTMLIFrameElement) {
          const f = this.child.frame;
          f.className = originalFrameClasses;
          f.style.display = originalFrameStyle.display;
          f.style.width = originalFrameStyle.width;
          f.style.height = originalFrameStyle.height;
          f.style.position = originalFrameStyle.position;
          f.style.top = originalFrameStyle.top;
          f.style.left = originalFrameStyle.left;
          f.style.right = originalFrameStyle.right;
          f.style.bottom = originalFrameStyle.bottom;
          f.style.opacity = originalFrameStyle.opacity;
          f.style.pointerEvents = originalFrameStyle.pointerEvents;
          f.style.zIndex = originalFrameStyle.zIndex;
          f.style.border = originalFrameStyle.border;
          f.style.borderRadius = originalFrameStyle.borderRadius;
          f.style.margin = originalFrameStyle.margin;
          f.style.padding = originalFrameStyle.padding;
          f.style.boxShadow = originalFrameStyle.boxShadow;
          f.style.transform = originalFrameStyle.transform;
        }
        if (container) {
          container.className = originalContainerClasses;
          container.style.display = originalContainerStyle.display;
          container.style.position = originalContainerStyle.position;
          container.style.top = originalContainerStyle.top;
          container.style.left = originalContainerStyle.left;
          container.style.width = originalContainerStyle.width;
          container.style.height = originalContainerStyle.height;
          container.style.zIndex = originalContainerStyle.zIndex;
          container.style.backgroundColor = originalContainerStyle.backgroundColor;
          container.style.pointerEvents = originalContainerStyle.pointerEvents;
          container.style.removeProperty("align-items");
          container.style.removeProperty("justify-content");
        }
        // Remove backdrop if we created it
        if (backdropCreated && backdrop && backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        } else if (backdrop) {
          // Reset backdrop styles if it existed
          backdrop.style.removeProperty("position");
          backdrop.style.removeProperty("top");
          backdrop.style.removeProperty("left");
          backdrop.style.removeProperty("width");
          backdrop.style.removeProperty("height");
          backdrop.style.removeProperty("background-color");
          backdrop.style.removeProperty("z-index");
        }
      },
    };
  }
}
