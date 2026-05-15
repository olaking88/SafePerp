
safeperp


## Getting started

> **Prerequisites:**
> The following steps require [NodeJS](https://nodejs.org/en/) to be installed on your system, so please
> install it beforehand if you haven't already.

To get started with your project, you'll first need to install the dependencies with:

```
npm install
```

Then, you'll be able to run a development version of the project with:

```
npm run dev
```

After a few seconds, your project should be accessible at the address
[http://localhost:5173/](http://localhost:5173/)


If you are satisfied with the result, you can finally build the project for release with:

```
npm run build
```
## Arcium Integration & Privacy Benefits

This project is a private perpetual futures trading application built on Solana and powered by Arcium’s encrypted computation network.

### How Arcium is Used

Arcium is integrated to process sensitive trading computations privately using secure multi-party computation (MPC).

The following trading logic is executed privately through Arcium circuits:

- Position encryption
- PnL computation
- Liquidation price calculation
- Trade state validation

Custom Arcium circuits used in this project include:

- `encrypt_position.arcis`
- `compute_pnl.arcis`
- `compute_liquidation.arcis`

These circuits are deployed through Supabase storage and used by the frontend to simulate encrypted trading workflows.

### Privacy Benefits

Traditional perpetual exchanges expose:

- Entry price
- Position size
- Leverage
- Liquidation thresholds
- Unrealized PnL

This creates risks like:

- Liquidation hunting
- Copy-trading attacks
- Front-running
- Strategy exposure

Arcium solves this by keeping trading computations encrypted.

Only the trader can view private position details, while PnL can be selectively revealed when desired.

### Why This Matters

This enables privacy-preserving on-chain perpetual trading where:

- Traders keep strategies confidential
- Market manipulation is reduced
- Liquidation targeting becomes harder
- DeFi trading gains institutional-grade privacy