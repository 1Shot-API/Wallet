import {
  BigNumberString,
  ELocale,
  EVMAccountAddress,
  OneShotPay,
  UnixTimestamp,
} from "@1shotapi/wallet";

const statusTextarea = document.getElementById(
  "statusTextarea",
) as HTMLTextAreaElement;
const initIndicator = document.getElementById("initIndicator");
const statusIndicator = document.getElementById("statusIndicator");
const getSignatureBtn = document.getElementById(
  "getSignatureBtn",
) as HTMLButtonElement;
const toggleFrameBtn = document.getElementById(
  "toggleFrameBtn",
) as HTMLButtonElement;
const x402UrlInput = document.getElementById("x402UrlInput") as HTMLInputElement;
const x402RequestBtn = document.getElementById(
  "x402RequestBtn",
) as HTMLButtonElement;

if (
  !statusTextarea ||
  !initIndicator ||
  !statusIndicator ||
  !getSignatureBtn ||
  !toggleFrameBtn ||
  !x402UrlInput ||
  !x402RequestBtn
) {
  throw new Error("Required elements not found");
}

function addStatusMessage(message: string, isError = false) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = isError ? "[ERROR]" : "[INFO]";
  const colorClass = isError ? "error" : "success";
  const logMessage = `${timestamp} ${prefix} ${message}\n`;
  
  statusTextarea.value += logMessage;
  statusTextarea.scrollTop = statusTextarea.scrollHeight;
  
  console.log(message);
}

function setIndicatorState(
  indicator: HTMLElement,
  state: "idle" | "active" | "complete" | "error",
) {
  indicator.className = "indicator-dot";
  if (state === "active") {
    indicator.classList.add("active");
  } else if (state === "complete") {
    indicator.classList.add("complete");
  } else if (state === "error") {
    indicator.classList.add("error");
  }
}

// Create wallet proxy instance
const oneShotPay = new OneShotPay();

// Set initial indicator state
setIndicatorState(initIndicator, "active");
addStatusMessage("Starting wallet initialization...");

// Initialize and get status
oneShotPay
  .initialize("Wallet", [], ELocale.English)
  .map(() => {
    setIndicatorState(initIndicator, "complete");
    addStatusMessage("Wallet initialized successfully");
    
    // Start getStatus indicator
    setIndicatorState(statusIndicator, "active");
    addStatusMessage("Calling getStatus()...");
  })
  .andThen(() => {
    return oneShotPay.getStatus();
  })
  .map((status) => {
    setIndicatorState(statusIndicator, "complete");
    addStatusMessage(
      `getStatus() successful: ${JSON.stringify(status, null, 2)}`,
    );
    
    // Enable the buttons now that initialization is complete
    getSignatureBtn.disabled = false;
    toggleFrameBtn.disabled = false;
    x402RequestBtn.disabled = false;
    addStatusMessage("Ready! Click the button to get ERC3009 signature.");
  })
  .mapErr((error) => {
    setIndicatorState(initIndicator, "error");
    setIndicatorState(statusIndicator, "error");
    addStatusMessage(`Error: ${error.message}`, true);
    console.error("Wallet error:", error);
  });

// Button click handler for getting signature
getSignatureBtn.addEventListener("click", () => {
  getSignatureBtn.disabled = true;
  addStatusMessage("Requesting ERC3009 signature...");
  
  oneShotPay
    .getERC3009Signature(
      "Test Transaction to Nobody",
      EVMAccountAddress("0x0000000000000000000000000000000000000000"),
      BigNumberString("1"),
      UnixTimestamp(1715222400),
      UnixTimestamp(1715222400),
    )
    .map((result) => {
      addStatusMessage(
        `ERC3009 signature received: ${JSON.stringify(result, null, 2)}`,
      );
      getSignatureBtn.disabled = false;
    })
    .mapErr((error) => {
      addStatusMessage(`Error getting signature: ${error.message}`, true);
      console.error("Signature error:", error);
      getSignatureBtn.disabled = false;
    });
});

// Toggle frame button handler
toggleFrameBtn.addEventListener("click", () => {
  if (oneShotPay.getVisible()) {
    oneShotPay.hide();
    addStatusMessage("Frame hidden");
  } else {
    oneShotPay.show();
    addStatusMessage("Frame shown");
  }
});

// x402 request handler
x402RequestBtn.addEventListener("click", () => {
  const url = (x402UrlInput.value || "").trim();
  if (!url) {
    addStatusMessage("Please enter an x402 URL.", true);
    return;
  }

  x402RequestBtn.disabled = true;
  addStatusMessage(`x402Fetch: ${url}`);

  oneShotPay.x402Fetch(url, { method: "GET" }).match(
    async (res) => {
      const contentType = res.headers.get("content-type") ?? "";
      let body: string;
      try {
        body = await res.text();
      } catch (e) {
        body = `(failed to read body: ${(e as Error).message})`;
      }

      addStatusMessage(`x402Fetch response status: ${res.status} ${res.statusText}`);

      if (contentType.includes("application/json")) {
        try {
          addStatusMessage(
            `x402Fetch response body (json): ${JSON.stringify(
              JSON.parse(body),
              null,
              2,
            )}`,
          );
        } catch {
          addStatusMessage(`x402Fetch response body: ${body}`);
        }
      } else {
        addStatusMessage(`x402Fetch response body: ${body}`);
      }

      x402RequestBtn.disabled = false;
    },
    (err) => {
      addStatusMessage(`x402Fetch error: ${err.message}`, true);
      console.error("x402Fetch error:", err);
      x402RequestBtn.disabled = false;
    },
  );
});
