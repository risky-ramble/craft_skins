use anchor_lang::prelude::*;
use anchor_lang::AccountsClose;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use metaplex_token_metadata::state::PREFIX as METAPLEX_PREFIX;
use metaplex_token_metadata::state::{Creator, Metadata};
use metaplex_token_metadata::utils::assert_derivation;
use std::str::FromStr;

declare_id!("CTvt7mspUNotZfaWNXCtUN2uCjSqxDCyD1nvpNQqixKX");

#[program]
pub mod craft_skins {
    use super::*;

    // init Manager to pay for Account creation/manipulation
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let program_manager = &mut ctx.accounts.program_manager;
        let manager = &ctx.accounts.manager;
        program_manager.admin = manager.key();
        Ok(())
    }

    /*
        Recipe is an NFT
        Recipe mint is used as a seed to find the Recipe account
        which contains Vec<Ingredient>
        Recipe NFT is the Collection struct in the all skin metadata...
    */
    pub fn create_recipe(
        // CreateRecipe contains accounts to init Recipe NFT
        ctx: Context<CreateRecipe>,
        ingredient_mints: Vec<Pubkey>,
        ingredient_amounts: Vec<u64>,
        program_signer_bump: u8,
    ) -> Result<()> {
        let recipe_account = &mut ctx.accounts.recipe;

        // loop through ingredient_mints / ingredient_amounts
        // add to CreateRecipe.recipe, see Recipe in lib.rs
        for (i, mint) in ingredient_mints.iter().enumerate() {
            recipe_account.mints.push(*mint);
            recipe_account
                .amounts
                .push(*ingredient_amounts.get(i).unwrap());
        }
        Ok(())
    }

    /*
    pub fn add_skin(ctx: Context<Skin>) -> Result<()> {
        Ok(())
    }

    /*
      CLIENT
        "buy skin" button clicked
        return mint of skin
      SERVER
        skin = semi fungible token
        skin.metadata.Collection = Recipe
        Recipe.ingredients = Vec<Ingredient>

        program.rpc.craft_skin(
          user_pubkey = payer,
          skin_mint = token_to_receive,
          recipe_pubkey = Recipe NFT,
          ingredients = tokens_to_send
        )
      ANCHOR
        validate skin_mint
            owned by Manager

    */
    pub fn craft_skin(ctx: Context<Craft>) -> Result<()> {
        Ok(())
    }
    */
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    // payer for accounts
    #[account(mut)]
    pub manager: Signer<'info>,

    // init Manager account
    #[account(
    init,
    payer = manager,
    seeds = [b"manager"],
    bump,
    space = 240
    )]
    pub program_manager: Account<'info, Manager>,
    // solana program
    pub system_program: Program<'info, System>,
}

// admin is program authority (he who owns the private key)
// signs for Account creation and manipulation
#[account]
pub struct Manager {
    admin: Pubkey,
}

#[derive(Accounts)]
#[instruction(admin_bump: u8, program_signer_bump: u8)]
pub struct CreateRecipe<'info> {
    // admin within Manager, payer for accounts
    #[account(mut, address = program_manager.admin)]
    pub manager: Signer<'info>,

    // holds admin within struct (clean way of defining it)
    #[account(seeds = [b"admin"], bump = admin_bump)]
    pub program_manager: Account<'info, Manager>,

    ///CHECK: Is simply a pda - seeds will be from program
    #[account(mut,seeds = [b"signer"], bump = program_signer_bump)]
    pub program_pda_signer: AccountInfo<'info>,

    // defines vector of ingredients to transfer
    #[account(
        init,
        payer = manager,
        seeds = [b"recipe", recipe_mint.key().as_ref()],
        bump,
        space = 240
    )]
    pub recipe: Account<'info, Recipe>,

    /*** required accounts to init a Master Edition NFT ***/
    #[account(mut)]
    pub recipe_token_account: Account<'info, TokenAccount>,
    pub recipe_mint: Account<'info, Mint>,
    ///CHECK: verification is run in instruction
    #[account(mut)]
    pub recipe_metadata: AccountInfo<'info>,

    /*** required programs to init accounts for Master Edition NFT ***/
    // holds SOL to pay for all Account rent
    pub rent_account: Sysvar<'info, Rent>,
    // creates Metadata account within Token Account
    #[account(address = metaplex_token_metadata::ID)]
    ///CHECK: verification is run in instruction
    pub token_metadata_program: AccountInfo<'info>,
    // creates Token Account of NFT
    pub token_program: Program<'info, Token>,
    // creates generic Account
    pub system_program: Program<'info, System>,
}

/*
    Recipe = class of skins
    Recipe holds data for ingredients
    All skins within Recipe have the same ingredients
    Ingredients are exchanged for a skin from this class
*/
#[account]
pub struct Recipe {
    pub mints: Vec<Pubkey>,
    pub amounts: Vec<u64>,
}

/*
#[derive(Accounts)]
pub struct Skin {}

#[derive(Accounts)]
pub struct Craft {}


#[error_code]
pub enum ErrorCode {
    #[msg("Fee should be <= 10000")]
    ErrFeeGreaterThan10000,
    #[msg("Insufficient funds")]
    ErrInsufficientFunds,
    #[msg("Metadata mint must match item mint")]
    ErrMetadataMintNotValid,
    #[msg("Nft not part of collection")]
    ErrNftNotPartOfCollection,
    #[msg("Derived key invalid")]
    DerivedKeyInvalid,
    #[msg("AccountNotInitialized")]
    NotInitialized,
}
*/
