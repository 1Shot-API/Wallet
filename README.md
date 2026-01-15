## 1Shot Wallet SDK (`@1shotapi/wallet`)

Embed the **1ShotPay passkey wallet** in your site via an iframe and call wallet actions through a simple TypeScript API.

- **Live demo**: `https://1shot-api.github.io/Wallet/`

## Install

```bash
yarn add @1shotapi/wallet
```

## Quick start

```ts
import {
  BigNumberString,
  ELocale,
  EVMAccountAddress,
  OneShotPay,
  UnixTimestamp,
} from "@1shotapi/wallet";

const wallet = new OneShotPay();

// Injects the wallet iframe into <div id="Wallet" />
await wallet.initialize("Wallet", [], ELocale.English).match(
  () => undefined,
  (err) => {
    throw err;
  },
);

// Show / hide the iframe UI
wallet.show();
wallet.hide();

// Request an ERC-3009 signature (this will show the iframe UI as needed)
const result = await wallet
  .getERC3009Signature(
    EVMAccountAddress("0x0000000000000000000000000000000000000000"),
    BigNumberString("1"),
    UnixTimestamp(1715222400),
    UnixTimestamp(1715222400),
  )
  .match(
    (ok) => ok,
    (err) => {
      throw err;
    },
  );
```

## API notes

- **Visibility**
  - `show()` displays the iframe using the same modal styling as interactive RPC calls.
  - `hide()` restores the iframe to its original state.
  - `getVisible()` returns whether the iframe is currently visible.
- **Iframe events**
  - `closeFrame`: emitted by the iframe when the user clicks its close button → SDK hides the iframe.
  - `registrationRequired`: emitted by the iframe with a URL → SDK hides the iframe and opens the URL in a new tab.

## Local dev (test app)

```bash
yarn dev
```

The Vite test app lives at `src/test/`.

## Build

```bash
yarn build
```
