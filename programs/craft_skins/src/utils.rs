use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount, ID as SPL_TOKEN_ID};
use metaplex_token_metadata::instruction::{sign_metadata, update_metadata_accounts};
use metaplex_token_metadata::state::{Creator, Data, Metadata, PREFIX};
use metaplex_token_metadata::utils::{
    assert_derivation, assert_edition_valid, assert_initialized, assert_owned_by,
};
use std::convert::TryFrom;
use std::str::FromStr;

// validate accounts needed to make Recipe NFT
pub fn verify_recipe_nft<'info, 'a>(
    recipe_token_account: &Account<'info, TokenAccount>,
    recipe_mint: &Account<'info, Mint>,
    recipe_metadata: &AccountInfo<'info>,
    owner: &Signer<'info>,
) -> Result<()> {
    // token acount -> Account Info (makes account contents readable)
    let recipe_token_account_info = &recipe_token_account.to_account_info();
    // check token account is init
    let recipe_token: spl_token::state::Account = assert_initialized(recipe_token_account_info)?;
    // check token account is owned by Solana SPL Token Program
    assert_owned_by(recipe_token_account_info, &SPL_TOKEN_ID)?;
    // check owner of token = param given to program
    assert_eq!(recipe_token.owner, owner.key());
    // check token account has a balance
    if recipe_token.amount < 1 {
        return Err(ErrorCode::TokenAmountInsufficient.into());
    }
    // check token account's mint is mint account passed to program
    if recipe_token.mint != recipe_mint.key() {
        return Err(ErrorCode::TokenMintInvalid.into());
    }
    // check metadata PDA was derived correctly (seeds are correct)
    assert_derivation(
        &metaplex_token_metadata::id(), // TOKEN_METADATA_PROGRAM_ID
        recipe_metadata,                // metadata account derived
        &[
            // expected seeds to derive recipe_metadata PDA
            PREFIX.as_bytes(),                      // PREFIX = "metadata"
            metaplex_token_metadata::id().as_ref(), // TOKEN_METADATA_PROGRAM_ID
            recipe_token.mint.as_ref(),             // mint pubkey
        ],
    )?;
    // check metadata account is not empty
    if recipe_metadata.data_is_empty() {
        return Err(ErrorCode::NotInitialized.into());
    };
    msg!("recipe_metadata account init");
    // check owner is creator/signer for metadata account
    let metadata_account = Metadata::from_account_info(&recipe_metadata)?;
    let creators_found = metadata_account.data.creators.clone().unwrap();
    creators_found
        .iter()
        .find(|c| c.verified && c.address == owner.key())
        .unwrap();
    msg!("Metadata creators validated");

    // all tests passed!
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Token account requires balance > 0 :(")]
    TokenAmountInsufficient,

    #[msg("Token account mint != mint account :(")]
    TokenMintInvalid,

    #[msg("Metadata account not initialized :(")]
    NotInitialized,

    #[msg("Wrong creators or already signed for program signer")]
    WrongCreators,

    #[msg("Not enough tokens")]
    NotEnoughToken,

    #[msg("Derived key is invalid for escrow account")]
    DerivedKeyInvalid,
}
