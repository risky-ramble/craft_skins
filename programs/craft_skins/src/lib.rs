use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::mint;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::assertions::collection::assert_collection_verify_is_valid;
use mpl_token_metadata::state::Metadata;

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
        verify_recipe_nft(
            &ctx.accounts.recipe_token_account, // token account holds everything
            &ctx.accounts.recipe_mint,          // mint is address
            &ctx.accounts.recipe_metadata,      // metadata is specific data, Metaplex standard
            &ctx.accounts.recipe_master_edition,
            &ctx.accounts.owner, // owner of Recipe NFT
        )?;
        msg!("Done verify recipe NFT");

        Ok(())
    }

    /**
      validate skin accounts (mint, metadata, verified collection in metadata)
      validate recipe accounts (mint, metadata, master edition)
      validate Collection mint can derive Recipe PDA
      validate Recipe PDA is init and owned by admin
    **/
    pub fn add_skin<'info>(
        // CreateRecipe contains accounts to init Recipe NFT
        ctx: Context<AddSkin>,
        _recipe_bump: u8,
    ) -> Result<()> {
        // validate accounts to create skin
        verify_skin(
            &ctx.accounts.skin_token_account, // token account holds everything
            &ctx.accounts.skin_mint,          // mint of skin
            &ctx.accounts.recipe_mint,
            &ctx.accounts.skin_metadata, // metadata is specific data, Metaplex standard
            &ctx.accounts.owner,         // owner of Recipe NFT
        )?;
        msg!("Done verify skin");

        // validate accounts for exisiting Recipe NFT
        verify_recipe_nft(
            &ctx.accounts.recipe_token_account,
            &ctx.accounts.recipe_mint,
            &ctx.accounts.recipe_metadata,
            &ctx.accounts.recipe_master_edition,
            &ctx.accounts.owner,
        )?;
        msg!("Done verify skin recipe");

        // validate recipe_account is correct PDA using recipe_mint as seed
        assert_recipe_derivation(
            &ctx.accounts.recipe,
            &ctx.program_id,
            &[b"recipe", &ctx.accounts.recipe_mint.key().as_ref()],
        )?;
        msg!("Done verify recipe account PDA");

        // validate collection
        let skin_metadata_account = &mut Metadata::from_account_info(&ctx.accounts.skin_metadata)?;
        let collection_metadata_account =
            &mut Metadata::from_account_info(&ctx.accounts.recipe_metadata)?;
        assert_collection_verify_is_valid(
            skin_metadata_account,
            collection_metadata_account,
            &ctx.accounts.recipe_mint.to_account_info(),
            &ctx.accounts.recipe_master_edition.to_account_info(),
        )?;
        msg!("Done verify collection");

        Ok(())
    }

    /*
      SERVER
        receive skin mint from client
        get skin metadata, ATA of user, collection mint
        get collection metadata, master edition, ATA of admin,
        get recipe PDA from collection mint
        get ATAs using recipe mint + user wallet (can they fulfill the recipe?)

      ANCHOR
        validate skin_mint
            owned by Manager
    */
    pub fn craft_skin<'info>(
        ctx: Context<'_, '_, '_, 'info, CraftSkin<'info>>,
        //program_signer_bump: u8,
    ) -> Result<()> {
        // validate accounts for existing skin
        verify_skin(
            &ctx.accounts.skin_token_account, // token account holds everything
            &ctx.accounts.skin_mint,          // mint of skin
            &ctx.accounts.recipe_mint,
            &ctx.accounts.skin_metadata, // metadata is specific data, Metaplex standard
            &ctx.accounts.owner,         // owner of Recipe NFT
        )?;
        msg!("Done verify skin");

        // validate accounts for exisiting Recipe NFT
        verify_recipe_nft(
            &ctx.accounts.recipe_token_account,
            &ctx.accounts.recipe_mint,
            &ctx.accounts.recipe_metadata,
            &ctx.accounts.recipe_master_edition,
            &ctx.accounts.owner,
        )?;
        msg!("Done verify skin recipe");

        // validate recipe_account is correct PDA using recipe_mint as seed
        assert_recipe_derivation(
            &ctx.accounts.recipe,
            &ctx.program_id,
            &[b"recipe", &ctx.accounts.recipe_mint.key().as_ref()],
        )?;

        // validate collection
        let skin_metadata_account = &mut Metadata::from_account_info(&ctx.accounts.skin_metadata)?;
        let collection_metadata_account =
            &mut Metadata::from_account_info(&ctx.accounts.recipe_metadata)?;
        assert_collection_verify_is_valid(
            skin_metadata_account,
            collection_metadata_account,
            &ctx.accounts.recipe_mint.to_account_info(),
            &ctx.accounts.recipe_master_edition.to_account_info(),
        )?;

        // validate each user token account holds required mint+amount defined in Recipe
        let mut i = 0;
        let iterator = &mut ctx.remaining_accounts.iter();
        while i < ctx.remaining_accounts.len() {
            // user ingredient token account
            let user_token = next_account_info(iterator)?;
            // user ingredient mint (should == ingredient_mint)
            let user_mint = next_account_info(iterator)?;
            // program escrow PDA to receive user ingredient
            let escrow_token = next_account_info(iterator)?;
            // expected ingredient mint -> defined in Recipe
            let ingredient_mint = &ctx.accounts.recipe.mints[i];
            // expected ingredient amount -> defined in Recipe
            let ingredient_amount = &ctx.accounts.recipe.amounts[i];

            // verify user ingredient token == required ingredient mint/amount defined in Recipe
            verify_user_ingredient(
                &user_token,                          // ingredient token account
                &ctx.accounts.user.to_account_info(), // owner of user_token account
                &ingredient_mint, // expected mint inside user_token, defined in Recipe
                &ingredient_amount, // expect amount inside user_token, deefined in Recipe
            )?;

            // do some stuff
            create_escrow_account(
                &ctx.accounts.user,
                &ctx.accounts.program_signer,
                escrow_token,
                user_mint,
                &ctx.accounts.rent_account,
                &ctx.accounts.token_program,
                &ctx.accounts.ata_program,
                &ctx.accounts.system_program,
            )?;

            // transfer token from user to escrow
            transfer_ingredient_to_escrow(
                user_token,
                escrow_token,
                &ctx.accounts.user,
                ingredient_amount,
                &ctx.accounts.token_program,
            )?;
            msg!("transfer_ingredient_to_escrow");

            i += 3;
        }
        msg!("Done user ingredient validations & transfer to escrows");

        create_user_token_account(
            &ctx.accounts.user,
            &ctx.accounts.program_signer,
            &ctx.accounts.user_skin_token_account,
            &ctx.accounts.skin_mint.to_account_info(),
            &ctx.accounts.rent_account,
            &ctx.accounts.token_program,
            &ctx.accounts.ata_program,
            &ctx.accounts.system_program,
        )?;
        msg!("Create if not init user_skin_token_account");

        // transfer skin to user
        transfer_skin_to_user(
            &ctx.accounts.skin_token_account.to_account_info(),
            &ctx.accounts.user_skin_token_account.to_account_info(),
            &ctx.accounts.program_signer,
            &ctx.accounts.token_program,
        )?;
        msg!("transfer_skin_to_user");

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

    ///CHECK: verification is run in instruction
    pub recipe_master_edition: AccountInfo<'info>,

    /**
      required programs for an NFT
    **/
    // holds SOL to pay for all Account rent
    pub rent_account: Sysvar<'info, Rent>,
    // creates Metadata account within Token Account
    #[account(address = mpl_token_metadata::ID)]
    ///CHECK: verification is run in instruction
    pub token_metadata_program: AccountInfo<'info>,
    // creates Token Account of NFT
    pub token_program: Program<'info, Token>,
    // creates generic Account
    pub system_program: Program<'info, System>,
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
        bump
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
    ///CHECK: verification is run in instruction
    pub recipe_master_edition: AccountInfo<'info>,

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
    #[account(address = mpl_token_metadata::ID)]
    ///CHECK: verification is run in instruction
    pub token_metadata_program: AccountInfo<'info>,
    // creates Token Account of NFT
    pub token_program: Program<'info, Token>,
    // creates generic Account
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CraftSkin<'info> {
    // owner of Recipe NFT
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut,seeds = [b"signer"], bump)]
    ///CHECK: Is simply a pda - seeds will be from program
    pub program_signer: UncheckedAccount<'info>,

    // recipe accounts
    #[account(
        seeds = [b"recipe", recipe_mint.key().as_ref()],
        bump
    )]
    pub recipe: Account<'info, Recipe>,
    #[account(mut)]
    pub recipe_token_account: Box<Account<'info, TokenAccount>>,
    pub recipe_mint: Box<Account<'info, Mint>>,
    ///CHECK: verification is run in instruction
    #[account(mut)]
    pub recipe_metadata: AccountInfo<'info>,
    ///CHECK: verification is run in instruction
    pub recipe_master_edition: AccountInfo<'info>,

    // ATA the user owns to receive the skin
    #[account(mut)]
    /// CHECK: validated in craft_skin
    pub user_skin_token_account: UncheckedAccount<'info>,
    // ATA the program owns the skin to transfer to user
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
    #[account(address = mpl_token_metadata::ID)]
    ///CHECK: verification is run in instruction
    pub token_metadata_program: AccountInfo<'info>,
    // creates Token Account of NFT
    pub token_program: Program<'info, Token>,
    pub ata_program: Program<'info, AssociatedToken>,
    // creates generic Account
    pub system_program: Program<'info, System>,
}
