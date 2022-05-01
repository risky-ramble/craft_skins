use anchor_lang::prelude::*;
use anchor_lang::AccountsClose;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, ID as SPL_TOKEN_ID};
use metaplex_token_metadata::state::PREFIX as METAPLEX_PREFIX;
use metaplex_token_metadata::state::{Creator, Metadata};
use metaplex_token_metadata::utils::assert_derivation;
use std::str::FromStr;
pub mod utils;
use utils::*;

declare_id!("34FUZfjWu2jMkBti3sKDrHH3rWRS3MjhWC5xjBps6cku");

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
        which contains vector of mints + amounts needed to craft a recipe
    */
    pub fn create_recipe(
        // CreateRecipe contains accounts to init Recipe NFT
        ctx: Context<CreateRecipe>,
        ingredient_mints: Vec<Pubkey>,
        ingredient_amounts: Vec<u64>,
    ) -> Result<()> {
        // loop through ingredient_mints / ingredient_amounts
        // add to CreateRecipe.recipe, see "pub struct Recipe" below
        let recipe_account = &mut ctx.accounts.recipe;
        for (i, mint) in ingredient_mints.iter().enumerate() {
            recipe_account.mints.push(*mint);
            recipe_account
                .amounts
                .push(*ingredient_amounts.get(i).unwrap());
        }
        msg!("Done recipe iter");

        // validate accounts to create Recipe NFT
        verify_nft(
            &ctx.accounts.recipe_token_account, // token account holds everything
            &ctx.accounts.recipe_mint,          // mint is address
            &ctx.accounts.recipe_metadata,      // metadata is specific data, Metaplex standard
            &ctx.accounts.owner,                // owner of Recipe NFT
        )?;
        msg!("Done verify recipe NFT");

        // add verify_collection to make NFT a valid Collection

        Ok(())
    }

    /**
      validate recipe accounts
      validate skin accounts
      validate Collection in metadata is recipe
    **/
    pub fn add_skin(
        // CreateRecipe contains accounts to init Recipe NFT
        ctx: Context<AddSkin>,
        recipe_bump: u8,
    ) -> Result<()> {
        // validate accounts to create Recipe NFT
        verify_nft(
            &ctx.accounts.skin_token_account, // token account holds everything
            &ctx.accounts.skin_mint,          // mint is address
            &ctx.accounts.skin_metadata,      // metadata is specific data, Metaplex standard
            &ctx.accounts.owner,              // owner of Recipe NFT
        )?;
        msg!("Done verify skin NFT");

        Ok(())
    }

    /*
      SERVER
        get skin master

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
pub struct CreateRecipe<'info> {
    // owner of Recipe NFT
    #[account(mut)]
    pub owner: Signer<'info>,

    /**
      account defining recipe of mints+amounts
      to craft a skin NFT
    **/
    #[account(
        init,
        payer = owner,
        seeds = [b"recipe", recipe_mint.key().as_ref()],
        bump,
        space = 240
    )]
    pub recipe: Account<'info, Recipe>,

    /**
      required accounts for an NFT
      should new Recipe NFT to mint
    **/
    #[account(mut)]
    pub recipe_token_account: Account<'info, TokenAccount>,
    pub recipe_mint: Account<'info, Mint>,
    ///CHECK: verification is run in instruction
    #[account(mut)]
    pub recipe_metadata: AccountInfo<'info>,

    /**
      required programs for an NFT
    **/
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
    validate necessary NFT accounts
      verify_recipe_nft
    find ingredients from recipe NFT account param
    validate recipe account
      seeds
      init
      owned by program?
    create skin with recipe as Collection

*/
#[derive(Accounts)]
#[instruction(recipe_bump: u8)]
pub struct AddSkin<'info> {
    // owner of Recipe NFT
    #[account(mut)]
    pub owner: Signer<'info>,

    /**
      account defining recipe of mints+amounts
      to craft a skin NFT
    **/
    #[account(
        seeds = [b"recipe", recipe_mint.key().as_ref()],
        bump = recipe_bump,
    )]
    pub recipe: Account<'info, Recipe>,

    /**
      required accounts for an NFT
      should be exisiting Recipe NFT
    **/
    #[account(mut)]
    pub recipe_token_account: Account<'info, TokenAccount>,
    pub recipe_mint: Account<'info, Mint>,
    ///CHECK: verification is run in instruction
    #[account(mut)]
    pub recipe_metadata: AccountInfo<'info>,

    /***
      required accounts for an NFT
      should be new skin to mint
    **/
    #[account(mut)]
    pub skin_token_account: Account<'info, TokenAccount>,
    pub skin_mint: Account<'info, Mint>,
    ///CHECK: verification is run in instruction
    #[account(mut)]
    pub skin_metadata: AccountInfo<'info>,

    /**
      required programs for an NFT
    **/
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

#[derive(Accounts)]
pub struct Craft {}
