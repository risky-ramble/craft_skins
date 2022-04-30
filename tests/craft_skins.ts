import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Program } from "@project-serum/anchor";
import { CraftSkins } from "../target/types/craft_skins";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { TOKEN_METADATA_PROGRAM_ID } from './data/constants';

import * as display from './utils/display'
import {
  createMint,
  getMetadataPDA,
} from './utils/utils'
import {
  recipe_nft_data,
  recipe_json_url,
  skin_nft_data,
  skin_json_url
} from "./data/data";
require('dotenv').config()
import { programs } from "@metaplex/js";
const {
  metadata: { MetadataData },
} = programs;

// Configure the client to use the local cluster
let provider = anchor.AnchorProvider.env()
anchor.setProvider(provider);

describe("craft_skins", () => {

  const program = anchor.workspace.CraftSkins as Program<CraftSkins>;

  // admin: human
  let manager: anchor.web3.Keypair
  let program_manager_acc: anchor.web3.PublicKey
  let program_manager_bump: number

  // stores recipe as mints[] + amounts[]
  let recipe_account: anchor.web3.PublicKey
  let recipe_bump: number

  let recipe_mint: anchor.web3.Keypair
  let recipe_metadata_PDA: anchor.web3.PublicKey
  let manager_recipe_ata: anchor.web3.PublicKey

  let skin_mint: anchor.web3.Keypair
  let skin_metadata_PDA: anchor.web3.PublicKey
  let manager_skin_ata: anchor.web3.PublicKey

/** ============================================================================================
                I N I T I A L I Z E   
    ============================================================================================  
**/

  // TEST initialize
  it("Is initialized", async () => {

    // airdrop funds to program manager
    manager = anchor.web3.Keypair.generate();
    console.log('manager: ', manager.publicKey.toString())
    let airdrop = await provider.connection.requestAirdrop(manager.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    console.log('airdrop? ', await provider.connection.confirmTransaction(airdrop));

    // init program manager
    [program_manager_acc, program_manager_bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("manager")],
        program.programId
      );
    console.log('program_manager_acc: ', program_manager_acc.toString())

    // manager insufficient funds?
    try {
      let init_tx = await program.methods.initialize()
      .accounts({
        manager: manager.publicKey,
        programManager: program_manager_acc,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([manager])
      .rpc()
      console.log(`${display.green}`,`${display.alien} Initialize transaction signature `, init_tx);
    } catch (err) {
      console.log(`${display.red}`,`${display.bomb} initialize failed `, err)
    }
  }); // end initialize

/** ============================================================================================
            C R E A T E       R E C I P E   
    ============================================================================================   
**/

  /*
    TEST craft_recipe
    FLOW:
      init 2 fungible tokens, add to ingredientMints, ingredientAmounts
      init program PDA signer => signs for PDAs, like escrow token accounts
      init PDA escrow token accounts for ingredients to be transferred
        => uses ingredientMints as seed
      init recipe account (ingredients)
      init recipe token account, NFT
      init recipe mint, NFT
      init recipe metadata, NFT
      init recipe master edition, NFT
  */
  it("Craft recipe", async () => {

    /*
      necessary accounts to make NFT:
        associated token account (ata) => owned by user, holds mint
        mint account => address of NFT
        metadata account => holds arbitrary data to customize NFT
    */
    // lamports (SOL) required to make mint Account rent exempt
    let lamports = await Token.getMinBalanceRentForExemptMint(
      provider.connection
    );
    const data = recipe_nft_data(manager.publicKey);
    let [
      new_recipe_mint, 
      new_recipe_metadata_PDA, 
      recipe_mint_tx,
      new_manager_recipe_ata
    ] = await createMint(
        provider.connection,
        manager.publicKey, // authority
        provider.wallet.publicKey, // payer
        manager.publicKey, // destination (owner)
        lamports,
        data, // metadata account
        recipe_json_url // metadata URI
    );
    recipe_mint = new_recipe_mint, // set as global variable
    recipe_metadata_PDA = new_recipe_metadata_PDA, // set as global variable
    manager_recipe_ata = new_manager_recipe_ata // set as global variable
    console.log('recipe_mint: ', recipe_mint.publicKey.toString())
    console.log('recipe_metadata_PDA: ', recipe_metadata_PDA.toString())
    console.log('manager_recipe_ata: ', manager_recipe_ata.toString())

    let recipeSig = await provider.sendAndConfirm(recipe_mint_tx, [recipe_mint, manager]);
    console.log('mint recipe signature: ', recipeSig);

    /* 
      get PDA of Recipe account
      stores ingredients, owned by program
      Recipe {
        mints: Vec<Pubkey>, // mint of each ingredient
        amounts: Vec<u64>, // quantity of each ingredient
      }
      seeds for recipe PDA defined in CreateRecipe.recipe in lib.rs
    */
    [recipe_account, recipe_bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("recipe"), recipe_mint.publicKey.toBuffer()],
      program.programId
    );
    console.log('recipe_account: ', recipe_account.toString())

    // test ingredient
    let ingredientMints = []
    ingredientMints.push(new PublicKey("Gvgxm6wRv9rkWdFqB4GSVt7DbetZJzedJV1JbJtJHtuh"));
    let ingredientAmounts = []
    ingredientAmounts.push(new BN(10));

    // call anchor program create_recipe
    try {
      const create_recipe_tx = await program.methods.createRecipe(
        program_manager_bump, ingredientMints, ingredientAmounts
        )
        .accounts({
          owner: manager.publicKey,
          programManager: program_manager_acc,
          recipe: recipe_account,
          recipeTokenAccount: manager_recipe_ata,
          recipeMint: recipe_mint.publicKey,
          recipeMetadata: recipe_metadata_PDA,
          rentAccount: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .signers([manager])
        .rpc()
      console.log(`${display.green}`,`${display.unicorn} CreateRecipe transaction signature `, create_recipe_tx);

      const created_recipe = await program.account.recipe.fetch(recipe_account);
      console.log('\n')
      console.log(` ${display.popcorn} VERIFY status of Recipe ...`);
      console.log(`${display.cyan}`,'created recipe: ');
      console.log('mints ', created_recipe.mints.toString());
      console.log('amounts', created_recipe.amounts.map(num => num.toNumber()));
  
      let recipe_metadata = await provider.connection.getAccountInfo(
        recipe_metadata_PDA
      );
      let recipe_info = MetadataData.deserialize(
        recipe_metadata.data
      );
  
      console.log(`${display.cyan}`,"recipe metadata ->")
      console.log(recipe_info.data.creators);
  
      const created_recipe_token = await provider.connection.getParsedAccountInfo(
        manager_recipe_ata
      );
      console.log(`${display.cyan}`,"recipe token -> ");
      //@ts-ignore
      console.log(created_recipe_token.value.data.parsed.info);
    } catch (err) {
      console.log(`${display.red}`,`${display.bomb} create_recipe failed`, err);
    }
  }); // end createRecipe

/** ============================================================================================
                  A D D    S K I N   
    ============================================================================================   
**/
  it("Add skin", async () => {
  
    /**
      Get exisiting Recipe accounts
    **/
    const existing_recipe_account = await program.account.recipe.fetch(recipe_account); // created in createRecipe
    console.log(`${display.cyan}`,'existing recipe: ');
    console.log('mints ', existing_recipe_account.mints.toString());
    console.log('amounts', existing_recipe_account.amounts.map(num => num.toNumber()));

    // exisiting recipe_mint. Created in createRecipe
    console.log('existing_recipe_mint: ', recipe_mint.publicKey.toString())
    // get associated token account. Owned by manager, holds recipe mint
    console.log('manager: ', manager.publicKey.toString())
    //const existing_recipe_ata = await getATA(recipe_mint.publicKey, manager.publicKey)
    const existing_recipe_ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
      TOKEN_PROGRAM_ID, // always token program id
      recipe_mint.publicKey, // mint
      manager.publicKey // token account destination/authority,
    );
    console.log('existing_recipe_ata: ', existing_recipe_ata.toString())
    // get metadata account
    const existing_recipe_metadata_pda = await getMetadataPDA(recipe_mint.publicKey)
    console.log('existing_recipe_metadata_pda: ', existing_recipe_metadata_pda.toString())
    
    /**
      init new Skin NFT accounts
    **/
    let lamports = await Token.getMinBalanceRentForExemptMint(
      provider.connection
    );
    const data = skin_nft_data(manager.publicKey);
    let [
        skin_mint, 
        skin_metadata_PDA, 
        skin_mint_tx,
        manager_skin_ata
      ] = await createMint(
          provider.connection,
          manager.publicKey, // authority
          provider.wallet.publicKey, // payer
          manager.publicKey, // destination (owner)
          lamports,
          data, // metadata account
          skin_json_url // metadata URI
      );
      console.log('skin_mint: ', skin_mint.publicKey.toString())
      console.log('skin_metadata: ', skin_metadata_PDA.toString())
      console.log('manager_skin_ata: ', manager_skin_ata.toString())
  
      let skinSig = await provider.sendAndConfirm(skin_mint_tx, [skin_mint, manager]);
      console.log('mint skin signature: ', skinSig);


    // call anchor program add_skin
    try {
      const add_skin_tx = await program.methods.addSkin(
        program_manager_bump, recipe_bump
        )
        .accounts({
          owner: manager.publicKey,
          programManager: program_manager_acc,
          recipe: recipe_account,
          recipeTokenAccount: manager_recipe_ata,
          recipeMint: recipe_mint.publicKey,
          recipeMetadata: recipe_metadata_PDA,
          skinTokenAccount: manager_skin_ata,
          skinMint: skin_mint.publicKey,
          skinMetadata: skin_metadata_PDA,
          rentAccount: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .signers([manager])
        .rpc()
      console.log(`${display.green}`,`${display.octopus} AddSkin transaction signature `, add_skin_tx);

      const created_recipe = await program.account.recipe.fetch(recipe_account);
      console.log('\n')
      console.log(` ${display.popcorn} VERIFY status of Skin ...`);
      console.log(`${display.cyan}`,'existing recipe: ');
      console.log('mints ', created_recipe.mints.toString());
      console.log('amounts', created_recipe.amounts.map(num => num.toNumber()));
  
      let skin_metadata = await provider.connection.getAccountInfo(
        skin_metadata_PDA
      );
      let skin_info = MetadataData.deserialize(
        skin_metadata.data
      );
  
      console.log(`${display.cyan}`,"skin metadata ->")
      console.log(skin_info.data.creators);
  
      let skin_token = await provider.connection.getParsedAccountInfo(
        manager_recipe_ata
      );
      console.log(`${display.cyan}`,"skin token -> ");
      //@ts-ignore
      console.log(skin_token.value.data.parsed.info);
    } catch (err) {
      console.log(`${display.red}`,`${display.bomb} add_skin failed`, err);
    }
  }); // end addSkin

});
