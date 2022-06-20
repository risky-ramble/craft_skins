use anchor_lang::context::CpiContext;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::{create, get_associated_token_address};
use anchor_spl::associated_token::{AssociatedToken, Create};
use anchor_spl::token::transfer;
use anchor_spl::token::{Mint, Token, TokenAccount, Transfer, ID as SPL_TOKEN_ID};
use mpl_token_metadata::state::{Metadata, PREFIX};
use mpl_token_metadata::utils::{
    assert_derivation, assert_edition_valid, assert_initialized, assert_owned_by,
};
use solana_program::account_info::AccountInfo;

// validate accounts needed to make Recipe NFT
pub fn verify_recipe_nft<'info, 'a>(
    token_account: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    metadata: &AccountInfo<'info>,
    edition: &AccountInfo<'info>,
    owner: &Signer<'info>,
) -> Result<()> {
    // token acount -> Account Info (makes account contents readable)
    let token_info = &token_account.to_account_info();
    // check token account is init
    let token: spl_token::state::Account = assert_initialized(token_info)?;
    // check token account is owned by Solana SPL Token Program
    assert_owned_by(token_info, &SPL_TOKEN_ID)?;
    // check owner of token = owner param given to program
    assert_eq!(token.owner, owner.key());
    // check token account has a balance (skin == amount of 1)
    if token.amount != 1 {
        return Err(ErrorCode::TokenAmountInvalid.into());
    }
    // check token account's mint is mint account passed to program
    if token.mint != mint.key() {
        return Err(ErrorCode::TokenMintInvalid.into());
    }
    // check metadata PDA was derived correctly
    assert_derivation(
        &mpl_token_metadata::id(), // TOKEN_METADATA_PROGRAM_ID
        metadata,                  // metadata account derived
        &[
            // expected seeds to derive recipe_metadata PDA
            PREFIX.as_bytes(),                 // PREFIX = "metadata"
            mpl_token_metadata::id().as_ref(), // TOKEN_METADATA_PROGRAM_ID
            token.mint.as_ref(),               // mint pubkey
        ],
    )?;

    // check master edition PDA was derived correctly
    assert_edition_valid(&mpl_token_metadata::id(), &mint.key(), edition)?;

    // check metadata account is not empty
    if metadata.data_is_empty() {
        return Err(ErrorCode::NotInitialized.into());
    };
    // check owner is creator/signer for metadata account
    let metadata_account = Metadata::from_account_info(&metadata)?;
    let creators_found = metadata_account.data.creators.clone().unwrap();
    creators_found
        .iter()
        .find(|c| c.verified && c.address == owner.key())
        .unwrap();

    // all tests passed!
    Ok(())
}

/*
    recipe_account is a PDA of seeds
    => ["recipe", recipe_mint], this.programId
    check recipe_account address == result of PDA
*/
pub fn assert_recipe_derivation<'info, 'a>(
    recipe_account: &Account<'info, Recipe>,
    program_id: &Pubkey,
    seeds: &[&[u8]],
) -> Result<()> {
    // derive recipe account PDA
    let (key, _) = Pubkey::find_program_address(&seeds, program_id);

    // if recipe_account doesn't match correct PDA, throw error
    if key != recipe_account.key() {
        return Err(ErrorCode::DerivedKeyInvalid.into());
    }
    Ok(())
}

pub fn assert_escrow_derivation<'info, 'a>(
    program_escrow: &AccountInfo<'a>,
    program_id: &Pubkey,
    seeds: &[&[u8]],
) -> Result<u8> {
    // derive recipe account PDA
    let (key, bump) = Pubkey::find_program_address(&seeds, program_id);
    // if recipe_account doesn't match correct PDA, throw error
    if key != *program_escrow.key {
        return Err(ErrorCode::DerivedKeyInvalid.into());
    }
    Ok(bump)
}

pub fn verify_token_account(
    escrow_token_account: &AccountInfo,
    owner: &AccountInfo,
    mint: &AccountInfo,
) -> Result<bool> {
    let check_escrow_key = get_associated_token_address(owner.key, mint.key);

    let data = escrow_token_account.try_borrow_data().unwrap();
    let acc = TokenAccount::try_deserialize(&mut &**data);

    match acc {
        Ok(account) => {
            assert_eq!(account.mint, mint.key());
            assert_eq!(escrow_token_account.key(), check_escrow_key);
            assert_eq!(account.owner, owner.key());
            assert_owned_by(escrow_token_account, &SPL_TOKEN_ID)?;
            Ok(false)
        }
        Err(_err) => Ok(true),
    }
}

pub fn assert_pda_derivation<'info, 'a>(
    account: &AccountInfo<'info>,
    program_id: &Pubkey,
    seeds: &[&[u8]],
) -> Result<u8> {
    // derive recipe account PDA
    let (key, bump) = Pubkey::find_program_address(&seeds, program_id);

    // if recipe_account doesn't match correct PDA, throw error
    if key != account.key() {
        return Err(ErrorCode::DerivedKeyInvalid.into());
    }
    Ok(bump)
}

pub fn verify_user_ingredient<'info>(
    user_ingredient_token: &AccountInfo,
    user: &AccountInfo,
    expected_ingredient_mint: &Pubkey,
    expected_ingredient_amount: &u64,
) -> Result<()> {
    // check token account is init
    let token: spl_token::state::Account = assert_initialized(user_ingredient_token)?;
    // check token account is owned by Solana SPL Token Program
    assert_owned_by(user_ingredient_token, &SPL_TOKEN_ID)?;
    // check owner of token = user
    assert_eq!(token.owner, user.key());

    // clone token account info
    let info = user_ingredient_token.try_borrow_data().unwrap();
    // construct account info into TokenAccount -> allows us to read contents/struct (AccountInfo)
    let token_account = TokenAccount::try_deserialize(&mut &**info).unwrap();

    // check user ingredient is required amount
    if token_account.amount != *expected_ingredient_amount {
        return Err(ErrorCode::TokenAmountInvalid.into());
    }
    // check user ingredient is required mint
    if token_account.mint != expected_ingredient_mint.key() {
        return Err(ErrorCode::TokenMintInvalid.into());
    }

    Ok(())
}

// validate accounts needed to make Recipe NFT
pub fn verify_skin<'info, 'a>(
    token_account: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    collection_mint: &Account<'info, Mint>,
    metadata: &AccountInfo<'info>,
    owner: &Signer<'info>,
) -> Result<()> {
    // token acount -> Account Info (makes account contents readable)
    let token_info = &token_account.to_account_info();
    // check token account is init
    let token: spl_token::state::Account = assert_initialized(token_info)?;
    // check token account is owned by Solana SPL Token Program
    assert_owned_by(token_info, &SPL_TOKEN_ID)?;
    // check owner of token = owner param given to program
    assert_eq!(token.owner, owner.key());
    // check token account has a balance (skin == amount of 1)
    if token.amount != 1 {
        return Err(ErrorCode::TokenAmountInvalid.into());
    }
    // check token account's mint is mint account passed to program
    if token.mint != mint.key() {
        return Err(ErrorCode::TokenMintInvalid.into());
    }
    // check metadata PDA was derived correctly
    assert_derivation(
        &mpl_token_metadata::id(), // TOKEN_METADATA_PROGRAM_ID
        metadata,                  // metadata account derived
        &[
            // expected seeds to derive recipe_metadata PDA
            PREFIX.as_bytes(),                 // PREFIX = "metadata"
            mpl_token_metadata::id().as_ref(), // TOKEN_METADATA_PROGRAM_ID
            token.mint.as_ref(),               // mint pubkey
        ],
    )?;

    // check metadata account is not empty
    if metadata.data_is_empty() {
        return Err(ErrorCode::NotInitialized.into());
    };

    // check owner is creator/signer for metadata account
    let metadata_account = Metadata::from_account_info(&metadata)?;
    let creators_found = metadata_account.data.creators.clone().unwrap();
    creators_found
        .iter()
        .find(|c| c.verified && c.address == owner.key())
        .unwrap();

    // check collection struct is set
    let collection_found = &mut metadata_account.collection.clone().unwrap();
    // check collection is verified
    if !collection_found.verified {
        return Err(ErrorCode::CollectionUnverified.into());
    }
    if collection_found.key != collection_mint.key() {
        return Err(ErrorCode::CollectionKeyInvalid.into());
    }

    // all tests passed!
    Ok(())
}

/// Creates associated token account using Program Derived Address for the given seeds
pub fn create_escrow_account<'info>(
    user: &Signer<'info>,
    program_signer: &AccountInfo<'info>,
    escrow_token: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    rent_account: &Sysvar<'info, Rent>,
    token_program: &Program<'info, Token>,
    ata_program: &Program<'info, AssociatedToken>,
    system_program: &Program<'info, System>,
) -> Result<()> {
    let not_init = verify_token_account(
        escrow_token,   // token account to receive ingredient from user
        program_signer, // owner of escrow_token account (is also a PDA)
        mint,           // expected ingredient mint defined in Recipe
    )
    .unwrap();

    // escrow token account not initialized -> create account
    if not_init {
        let cpi_accounts = Create {
            payer: user.to_account_info(),
            associated_token: escrow_token.to_account_info(),
            authority: program_signer.to_account_info(),
            mint: mint.clone(),
            system_program: system_program.to_account_info(),
            token_program: token_program.to_account_info(),
            rent: rent_account.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(ata_program.to_account_info(), cpi_accounts);
        // create account
        create(cpi_ctx)?;
    }
    Ok(())
}

/// Creates associated token account using Program Derived Address for the given seeds
pub fn create_user_token_account<'info>(
    user: &Signer<'info>,
    program_signer: &AccountInfo<'info>,
    token: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    rent_account: &Sysvar<'info, Rent>,
    token_program: &Program<'info, Token>,
    ata_program: &Program<'info, AssociatedToken>,
    system_program: &Program<'info, System>,
) -> Result<()> {
    let not_init = verify_token_account(
        token, // token account to receive ingredient from user
        user,  // owner of escrow_token account (is also a PDA)
        mint,  // expected ingredient mint defined in Recipe
    )
    .unwrap();

    // escrow token account not initialized -> create account
    if not_init {
        let cpi_accounts = Create {
            payer: user.to_account_info(),
            associated_token: token.to_account_info(),
            authority: user.to_account_info(),
            mint: mint.clone(),
            system_program: system_program.to_account_info(),
            token_program: token_program.to_account_info(),
            rent: rent_account.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(ata_program.to_account_info(), cpi_accounts);
        // create account
        create(cpi_ctx)?;
    }
    Ok(())
}

pub fn transfer_ingredient_to_escrow<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    payer: &AccountInfo<'info>,
    amount: &u64,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: payer.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    transfer(cpi_ctx, *amount)?;
    Ok(())
}

pub fn check_token_is_init<'info>(
    token: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
) -> Result<bool> {
    let data = token.try_borrow_data().unwrap();
    let info = TokenAccount::try_deserialize(&mut &**data);
    match info {
        Ok(account) => {
            assert_eq!(account.mint, mint.key());
            assert_eq!(account.owner, owner.key());
            assert_owned_by(token, &SPL_TOKEN_ID)?;
            Ok(false)
        }
        Err(_err) => Ok(true),
    }
}

pub fn transfer_skin_to_user<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    // transfer to user
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(token_program.to_account_info(), cpi_accounts);
    transfer(cpi_ctx, 1)?;
    Ok(())
}

#[account]
pub struct Recipe {
    pub mints: Vec<Pubkey>,
    pub amounts: Vec<u64>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Token account requires balance of 1")]
    TokenAmountInvalid,

    #[msg("Token account owner is invalid")]
    TokenOwnerInvalid,

    #[msg("Token account mint != expected Recipe mint")]
    TokenMintInvalid,

    #[msg("Metadata account not initialized")]
    NotInitialized,

    #[msg("Wrong creators or already signed for program signer")]
    WrongCreators,

    #[msg("Not enough tokens")]
    NotEnoughToken,

    #[msg("Derived key is invalid PDA")]
    DerivedKeyInvalid,

    #[msg("Collection is unverified")]
    CollectionUnverified,

    #[msg("Collect key is not expected value")]
    CollectionKeyInvalid,

    #[msg("User token account mint != user mint account")]
    TokenMintMismatch,

    #[msg("Escrow token account not initialized")]
    EscrowNotInitialized,
}
