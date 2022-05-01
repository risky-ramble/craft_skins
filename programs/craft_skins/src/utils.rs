use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, ID as SPL_TOKEN_ID};
use log::{debug, info};
use mpl_token_metadata::instruction::{sign_metadata, update_metadata_accounts};
use mpl_token_metadata::state::{Creator, Data, Metadata, EDITION, PREFIX};
use mpl_token_metadata::utils::{
    assert_derivation, assert_edition_valid, assert_initialized, assert_owned_by,
};
use std::convert::TryFrom;
use std::str::FromStr;

//use mpl_token_metadata::assertions::collection::{
//assert_collection_verify_is_valid, assert_has_collection_authority,
//};
//use mpl_token_metadata::state::{Collection, DataV2};

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
    msg!("Recipe metadata validated");

    // check master edition PDA was derived correctly
    assert_edition_valid(&mpl_token_metadata::id(), &mint.key(), edition)?;
    msg!("Recipe master edition validated");

    // check metadata account is not empty
    if metadata.data_is_empty() {
        return Err(ErrorCode::NotInitialized.into());
    };
    msg!("metadata account init");
    // check owner is creator/signer for metadata account
    let metadata_account = Metadata::from_account_info(&metadata)?;
    let creators_found = metadata_account.data.creators.clone().unwrap();
    creators_found
        .iter()
        .find(|c| c.verified && c.address == owner.key())
        .unwrap();
    msg!("metadata creators validated");

    // all tests passed!
    Ok(())
}

/*
    recipe_account is a PDA of seeds
    => ["recipe", recipe_mint], this.programId
    check recipe_account address == result of PDA
*/
pub fn verify_recipe_pda<'info, 'a>(
    recipe_account: &Account<'info, Recipe>,
    program_id: &Pubkey,
    seeds: &[&[u8]],
) -> Result<bool> {
    // derive recipe account PDA
    let (key, _) = Pubkey::find_program_address(&seeds, program_id);

    // if recipe_account doesn't match correct PDA, throw error
    if key != recipe_account.key() {
        return Err(ErrorCode::DerivedKeyInvalid.into());
    }
    Ok(true)
}

// validate accounts needed to make Recipe NFT
pub fn verify_skin_nft<'info, 'a>(
    token_account: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
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
    msg!("Recipe metadata validated");

    // check metadata account is not empty
    if metadata.data_is_empty() {
        return Err(ErrorCode::NotInitialized.into());
    };
    msg!("metadata account init");
    // check owner is creator/signer for metadata account
    let metadata_account = Metadata::from_account_info(&metadata)?;
    let creators_found = metadata_account.data.creators.clone().unwrap();
    creators_found
        .iter()
        .find(|c| c.verified && c.address == owner.key())
        .unwrap();
    msg!("metadata creators validated");

    // all tests passed!
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

    #[msg("Token account mint != mint account")]
    TokenMintInvalid,

    #[msg("Metadata account not initialized")]
    NotInitialized,

    #[msg("Wrong creators or already signed for program signer")]
    WrongCreators,

    #[msg("Not enough tokens")]
    NotEnoughToken,

    #[msg("Derived key is invalid recipe account")]
    DerivedKeyInvalid,
}
