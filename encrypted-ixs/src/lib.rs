use arcis::encrypted;

#[encrypted]
mod circuits {
    use arcis::*;

    pub struct PositionSecrets {
        pub collateral: u64,
        pub entry_price: u64,
    }

    pub struct LiquidationInputs {
        pub entry_price: u64,
        pub leverage: u8,
    }

    #[instruction]
    pub fn encrypt_position(
        secrets_ctxt: Enc<Shared, PositionSecrets>,
    ) -> Enc<Shared, PositionSecrets> {
        secrets_ctxt
    }

#[instruction]
pub fn compute_liquidation(
    entry_price_ctxt: Enc<Shared, u64>,
    leverage_ctxt: Enc<Shared, u8>,
    side: u8,
) -> Enc<Shared, u64> {
    let entry = entry_price_ctxt.to_arcis();
    let lev = leverage_ctxt.to_arcis() as u64;
    let liq = if side == 0 {
        entry * (lev - 1) / lev
    } else {
        entry * (lev + 1) / lev
    };
    entry_price_ctxt.owner.from_arcis(liq)
}

   #[instruction]
pub fn compute_pnl(
    secrets_ctxt: Enc<Shared, PositionSecrets>,
    exit_price: u64,
    leverage: u8,
    side: u8,
) -> Enc<Shared, i64> {
    let s = secrets_ctxt.to_arcis();
    let collateral = s.collateral as i64;
    let entry = s.entry_price as i64;
    let exit = exit_price as i64;
    let lev = leverage as i64;
    let price_diff = if side == 0 {
        exit - entry
    } else {
        entry - exit
    };
    let pnl = collateral * lev * price_diff;
    secrets_ctxt.owner.from_arcis(pnl)
}
}
