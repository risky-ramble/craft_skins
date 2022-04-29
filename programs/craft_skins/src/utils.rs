use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
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
    program_pda_signer: &AccountInfo<'info>,
    owner: &Signer<'info>,
) -> Result<()> {
    assert_eq!(user_token_account.owner, user.key());
    if user_token_account.amount < 1 {
        return Err(ErrorCode::NotEnoughToken.into());
    }

    if user_token_account.mint != user_mint.key() {
        return Err(ErrorCode::TokenEditionMintMisMatch.into());
    }

    //validate metadata acc
    assert_derivation(
        &metaplex_token_metadata::id(),
        user_metadata_account,
        &[
            PREFIX.as_bytes(),
            metaplex_token_metadata::id().as_ref(),
            user_token_account.mint.as_ref(),
        ],
    )?;
    if user_metadata_account.data_is_empty() {
        return Err(ErrorCode::NotInitialized.into());
    };

    let metadata_account = Metadata::from_account_info(&user_metadata_account)?;
    let creators_found = metadata_account.data.creators.unwrap();
    creators_found
        .iter()
        .find(|c| c.verified && c.address == program_pda_signer.key())
        .unwrap();

    Ok(())
}
