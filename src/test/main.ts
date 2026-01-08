import { WalletProxy } from "WalletProxy";
import { ELocale } from "types/enum";
import { BigNumberString, EVMAccountAddress, UnixTimestamp } from "types/primitives";

const statusDiv = document.getElementById("status");
if (!statusDiv) {
  throw new Error("Status div not found");
}

function updateStatus(message: string, isError = false) {
  statusDiv.textContent = message;
  statusDiv.className = isError ? "error" : "success";
  console.log(message);
}

// Create wallet proxy instance
const walletProxy = new WalletProxy();

// Initialize and get status
walletProxy
  .initialize("Wallet", [], ELocale.English)
  .andThen(() => {
    return walletProxy.getStatus();
  })
  .map((status) => {
    updateStatus(`Success! Status: ${JSON.stringify(status, null, 2)}`);
  })
  .andThen(() => {
    return walletProxy.getERC3009Signature(EVMAccountAddress("0x0000000000000000000000000000000000000000"), BigNumberString("1"), UnixTimestamp(1715222400), UnixTimestamp(1715222400));
  })
  .mapErr((error) => {
    updateStatus(`Error: ${error.message}`, true);
    console.error("Wallet error:", error);
  });

