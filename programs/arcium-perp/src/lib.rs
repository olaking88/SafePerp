#![allow(unused_imports)]
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;
use arcium_macros::arcium_program;
declare_id!("7sm6PJZwQDanL3oK3bXVyvdk8MS3DjP34fTCy7MWfvYa");

const COMP_DEF_OFFSET_ENCRYPT_POSITION: u32 = comp_def_offset("encrypt_position");
const COMP_DEF_OFFSET_COMPUTE_LIQUIDATION: u32 = comp_def_offset("compute_liquidation");
const COMP_DEF_OFFSET_COMPUTE_PNL: u32 = comp_def_offset("compute_pnl");

#[arcium_program]
pub mod arcium_perp {
    use super::*;

    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;
        user_account.owner            = ctx.accounts.owner.key();
        user_account.usdc_balance     = 0;
        user_account.protocol_balance = 0;
        user_account.total_positions  = 0;
        user_account.bump             = ctx.bumps.user_account;
        msg!("User account initialised for: {}", ctx.accounts.owner.key());
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        let cpi_accounts = Transfer {
            from:      ctx.accounts.user_token_account.to_account_info(),
            to:        ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        let ua = &mut ctx.accounts.user_account;
        ua.protocol_balance = ua.protocol_balance.checked_add(amount).ok_or(ErrorCode::Overflow)?;
        msg!("Deposited {} USDC (raw units)", amount);
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        let ua = &mut ctx.accounts.user_account;
        require!(ua.protocol_balance >= amount, ErrorCode::InsufficientBalance);
        let seeds  = &[b"vault_authority".as_ref(), &[ctx.bumps.vault_authority]];
        let signer = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from:      ctx.accounts.vault_token_account.to_account_info(),
            to:        ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(), cpi_accounts, signer,
        );
        token::transfer(cpi_ctx, amount)?;
        ua.protocol_balance = ua.protocol_balance.checked_sub(amount).ok_or(ErrorCode::Overflow)?;
        msg!("Withdrew {} USDC (raw units)", amount);
        Ok(())
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        market: String,
        side: u8,
        leverage: u8,
        collateral: u64,
        entry_price: u64,
        size: u64,
    ) -> Result<()> {
        require!(leverage >= 1 && leverage <= 100, ErrorCode::InvalidLeverage);
        require!(collateral > 0, ErrorCode::InvalidAmount);
        require!(market.len() <= 16, ErrorCode::InvalidMarket);
        let ua = &mut ctx.accounts.user_account;
        require!(ua.protocol_balance >= collateral, ErrorCode::InsufficientBalance);
        ua.protocol_balance = ua.protocol_balance.checked_sub(collateral).ok_or(ErrorCode::Overflow)?;
        let lev = leverage as u64;
        let liquidation_price = if side == 0 {
            entry_price.checked_mul(lev.checked_sub(1).ok_or(ErrorCode::Overflow)?).ok_or(ErrorCode::Overflow)?
                       .checked_div(lev).ok_or(ErrorCode::Overflow)?
        } else {
            entry_price.checked_mul(lev.checked_add(1).ok_or(ErrorCode::Overflow)?).ok_or(ErrorCode::Overflow)?
                       .checked_div(lev).ok_or(ErrorCode::Overflow)?
        };
        let position = &mut ctx.accounts.position;
        position.owner             = ctx.accounts.owner.key();
        position.market            = market;
        position.side              = side;
        position.leverage          = leverage;
        position.collateral        = collateral;
        position.entry_price       = entry_price;
        position.size              = size;
        position.liquidation_price = liquidation_price;
        position.pnl               = 0i64;
        position.status            = 0;
        position.index             = ua.total_positions;
        position.bump              = ctx.bumps.position;
        position.enc_collateral        = [0u8; 32];
        position.enc_entry_price       = [0u8; 32];
        position.enc_liquidation_price = [0u8; 32];
        ua.total_positions = ua.total_positions.checked_add(1).ok_or(ErrorCode::Overflow)?;
        msg!("Opened {} position on {} with {}x", side, position.market, leverage);
        Ok(())
    }

    pub fn close_position(ctx: Context<ClosePosition>, exit_price: u64) -> Result<()> {
        let position = &mut ctx.accounts.position;
        require!(position.status == 0, ErrorCode::PositionAlreadyClosed);
        require!(position.owner == ctx.accounts.owner.key(), ErrorCode::Unauthorized);
        let lev        = position.leverage as i64;
        let entry      = position.entry_price as i64;
        let exit       = exit_price as i64;
        let collateral = position.collateral as i64;
        let raw_pnl = if position.side == 0 {
            collateral.checked_mul(lev).ok_or(ErrorCode::Overflow)?
                      .checked_mul(exit.checked_sub(entry).ok_or(ErrorCode::Overflow)?).ok_or(ErrorCode::Overflow)?
                      .checked_div(entry).ok_or(ErrorCode::Overflow)?
        } else {
            collateral.checked_mul(lev).ok_or(ErrorCode::Overflow)?
                      .checked_mul(entry.checked_sub(exit).ok_or(ErrorCode::Overflow)?).ok_or(ErrorCode::Overflow)?
                      .checked_div(entry).ok_or(ErrorCode::Overflow)?
        };
        position.pnl    = raw_pnl;
        position.status = 1;
        let ua         = &mut ctx.accounts.user_account;
        let settlement = (position.collateral as i64).checked_add(raw_pnl).ok_or(ErrorCode::Overflow)?;
        if settlement > 0 {
            ua.protocol_balance = ua.protocol_balance
                .checked_add(settlement as u64).ok_or(ErrorCode::Overflow)?;
        }
        msg!("Closed position. PnL: {}", raw_pnl);
        Ok(())
    }

    pub fn init_encrypt_position_comp_def(ctx: Context<InitEncryptPositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "http://tmpfiles.org/dl/37662142/encrypt_position.arcis".to_string(),
            hash: circuit_hash!("encrypt_position"),
        })), None)?;
        Ok(())
    }

    pub fn init_compute_liquidation_comp_def(ctx: Context<InitComputeLiquidationCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "http://tmpfiles.org/dl/37662150/compute_liquidation.arcis".to_string(),
            hash: circuit_hash!("compute_liquidation"),
        })), None)?;
        Ok(())
    }

    pub fn init_compute_pnl_comp_def(ctx: Context<InitComputePnlCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "http://tmpfiles.org/dl/37662153/compute_pnl.arcis".to_string(),
            hash: circuit_hash!("compute_pnl"),
        })), None)?;
        Ok(())
    }

pub fn arcium_encrypt_position(
        ctx: Context<ArciumEncryptPosition>,
        computation_offset: u64,
        enc_collateral:  [u8; 32],
        enc_entry_price: [u8; 32],
        pub_key: [u8; 32],
        nonce:   u128,
    ) -> Result<()> {
        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_collateral)
            .encrypted_u64(enc_entry_price)
            .build();
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![EncryptPositionCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[arcium_client::idl::arcium::types::CallbackAccount {
                    pubkey: ctx.accounts.position.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "encrypt_position")]
    pub fn encrypt_position_callback(
        ctx: Context<EncryptPositionCallback>,
        output: SignedComputationOutputs<EncryptPositionOutput>,
    ) -> Result<()> {
        let EncryptPositionOutput { field_0 } = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("encrypt_position callback error: {}", e);
                return Err(ErrorCode::ArciumCallbackFailed.into());
            }
        };
        let enc_collateral  = field_0.ciphertexts[0];
        let enc_entry_price = field_0.ciphertexts[1];
        let position_key = ctx.accounts.position.key();
        let position = &mut ctx.accounts.position;
        position.enc_collateral  = enc_collateral;
        position.enc_entry_price = enc_entry_price;
        emit!(PositionEncryptedEvent {
            position: position_key,
            enc_collateral,
            enc_entry_price,
        });
        Ok(())
    }

    pub fn arcium_compute_liquidation(
        ctx: Context<ArciumComputeLiquidation>,
        computation_offset: u64,
        enc_entry_price: [u8; 32],
        enc_leverage:    [u8; 32],
        side:            u8,
        pub_key: [u8; 32],
        nonce:   u128,
    ) -> Result<()> {
        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_entry_price)
            .encrypted_u8(enc_leverage)
            .plaintext_u8(side)
            .build();
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ComputeLiquidationCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;
        Ok(())
    }

        #[arcium_callback(encrypted_ix = "compute_liquidation")]
    pub fn compute_liquidation_callback(
        ctx: Context<ComputeLiquidationCallback>,
        output: SignedComputationOutputs<ComputeLiquidationOutput>,
    ) -> Result<()> {
        let ComputeLiquidationOutput { field_0 } = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("compute_liquidation callback error: {}", e);
                return Err(ErrorCode::ArciumCallbackFailed.into());
            }
        };
        let enc_liq_price = field_0.ciphertexts[0];
        let nonce_bytes   = field_0.nonce.to_le_bytes();
        let position_key  = ctx.accounts.position.key();
        let position = &mut ctx.accounts.position;
        position.enc_liquidation_price = enc_liq_price;
        emit!(LiquidationComputedEvent {
            position: position_key,
            enc_liquidation_price: enc_liq_price,
            nonce: nonce_bytes,
        });
        Ok(())
    }

    pub fn arcium_compute_pnl(
        ctx: Context<ArciumComputePnl>,
        computation_offset: u64,
        enc_collateral:  [u8; 32],
        enc_entry_price: [u8; 32],
        exit_price: u64,
        leverage:   u8,
        side:       u8,
        pub_key: [u8; 32],
        nonce:   u128,
    ) -> Result<()> {
        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(enc_collateral)
            .encrypted_u64(enc_entry_price)
            .plaintext_u64(exit_price)
            .plaintext_u8(leverage)
            .plaintext_u8(side)
            .build();
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;
        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
           vec![ComputePnlCallback::callback_ix(
    computation_offset,
    &ctx.accounts.mxe_account,
    &[arcium_client::idl::arcium::types::CallbackAccount {
        pubkey: ctx.accounts.position.key(),
        is_writable: false,
    }],
)?],
            1,
            0,
        )?;
        Ok(())
    }

    #[arcium_callback(encrypted_ix = "compute_pnl")]
    pub fn compute_pnl_callback(
        ctx: Context<ComputePnlCallback>,
        output: SignedComputationOutputs<ComputePnlOutput>,
    ) -> Result<()> {
        let ComputePnlOutput { field_0 } = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(o) => o,
            Err(e) => {
                msg!("compute_pnl callback error: {}", e);
                return Err(ErrorCode::ArciumCallbackFailed.into());
            }
        };
        let enc_pnl      = field_0.ciphertexts[0];
        let nonce_bytes  = field_0.nonce.to_le_bytes();
        let position_key = ctx.accounts.position.key();
        emit!(PnlComputedEvent {
            position: position_key,
            enc_pnl,
            nonce: nonce_bytes,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + UserAccount::SIZE,
        seeds = [b"user_account", owner.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"user_account", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"user_account", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: PDA used only as signing authority for vault CPI
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(market: String)]
pub struct OpenPosition<'info> {
    #[account(mut, seeds = [b"user_account", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + PositionAccount::SIZE,
        seeds = [b"position", owner.key().as_ref(), user_account.total_positions.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, PositionAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut, seeds = [b"user_account", owner.key().as_ref()], bump = user_account.bump)]
    pub user_account: Account<'info, UserAccount>,
    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, PositionAccount>,
    pub owner: Signer<'info>,
}

#[init_computation_definition_accounts("encrypt_position", payer)]
#[derive(Accounts)]
pub struct InitEncryptPositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("compute_liquidation", payer)]
#[derive(Accounts)]
pub struct InitComputeLiquidationCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("compute_pnl", payer)]
#[derive(Accounts)]
pub struct InitComputePnlCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("encrypt_position", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ArciumEncryptPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"position", payer.key().as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, PositionAccount>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ENCRYPT_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("encrypt_position")]
#[derive(Accounts)]
pub struct EncryptPositionCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_ENCRYPT_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    pub cluster_account: Account<'info, Cluster>,
    /// CHECK: instructions_sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub position: Account<'info, PositionAccount>,
}

#[queue_computation_accounts("compute_liquidation", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ArciumComputeLiquidation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"position", payer.key().as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, PositionAccount>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_LIQUIDATION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_liquidation")]
#[derive(Accounts)]
pub struct ComputeLiquidationCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_LIQUIDATION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    pub cluster_account: Account<'info, Cluster>,
    /// CHECK: instructions_sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub position: Account<'info, PositionAccount>,
}

#[queue_computation_accounts("compute_pnl", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ArciumComputePnl<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [b"position", payer.key().as_ref(), position.index.to_le_bytes().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, PositionAccount>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: mempool_account, checked by the arcium program.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: executing_pool, checked by the arcium program.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ArciumCallbackFailed))]
    /// CHECK: computation_account, checked by the arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_PNL))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("compute_pnl")]
#[derive(Accounts)]
pub struct ComputePnlCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_PNL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ArciumCallbackFailed))]
    pub cluster_account: Account<'info, Cluster>,
    /// CHECK: instructions_sysvar
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: AccountInfo<'info>,
    pub position: Account<'info, PositionAccount>,
}

#[account]
pub struct UserAccount {
    pub owner:            Pubkey,
    pub usdc_balance:     u64,
    pub protocol_balance: u64,
    pub total_positions:  u64,
    pub bump:             u8,
}
impl UserAccount {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct PositionAccount {
    pub owner:                 Pubkey,
    pub market:                String,
    pub side:                  u8,
    pub leverage:              u8,
    pub collateral:            u64,
    pub entry_price:           u64,
    pub size:                  u64,
    pub liquidation_price:     u64,
    pub pnl:                   i64,
    pub status:                u8,
    pub index:                 u64,
    pub bump:                  u8,
    pub enc_collateral:        [u8; 32],
    pub enc_entry_price:       [u8; 32],
    pub enc_liquidation_price: [u8; 32],
}
impl PositionAccount {
    pub const SIZE: usize =
        32 + (4 + 16) + 1 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 1
        + 32 + 32 + 32;
}

#[event]
pub struct PositionEncryptedEvent {
    pub position:        Pubkey,
    pub enc_collateral:  [u8; 32],
    pub enc_entry_price: [u8; 32],
}

#[event]
pub struct LiquidationComputedEvent {
    pub position:              Pubkey,
    pub enc_liquidation_price: [u8; 32],
    pub nonce:                 [u8; 16],
}

#[event]
pub struct PnlComputedEvent {
    pub position: Pubkey,
    pub enc_pnl:  [u8; 32],
    pub nonce:    [u8; 16],
}

#[error_code]
pub enum ErrorCode {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Insufficient protocol balance")]
    InsufficientBalance,
    #[msg("Leverage must be between 1 and 100")]
    InvalidLeverage,
    #[msg("Market string too long (max 16 chars)")]
    InvalidMarket,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Position is already closed")]
    PositionAlreadyClosed,
    #[msg("Signer is not the position owner")]
    Unauthorized,
    #[msg("Arcium MXE callback verification failed")]
    ArciumCallbackFailed,
    #[msg("Cluster not set")]
    ClusterNotSet,
}