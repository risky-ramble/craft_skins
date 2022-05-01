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
  createRecipe,
  createSkin,
  getMasterEdition,
  getMetadata,
  verifySkinCollection
} from './utils/utils'
import {
  recipe_nft_data,
  recipe_json_url,
  skin_data,
  skin_json_url
} from "./data/data";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import { programs } from "@metaplex/js";
const { metadata: { MetadataData, MetadataProgram } } = programs;

// Configure the client to use the local cluster
let provider = anchor.AnchorProvider.env()
anchor.setProvider(provider);
let wallet = (provider.wallet as anchor.Wallet).payer


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
  let recipe_ata: anchor.web3.PublicKey

  let skin_mint: anchor.web3.Keypair
  let skin_metadata_PDA: anchor.web3.PublicKey
  let skin_ata: anchor.web3.PublicKey

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
    console.log('confirmed manager airdrop? ', await provider.connection.confirmTransaction(airdrop));

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
      .signers([wallet, manager])
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
      new_recipe_ata
    ] = await createRecipe(
      provider.wallet.publicKey, // authority/payer
      provider.wallet.publicKey, // destination (owner)
      lamports,
      data, // metadata account
      recipe_json_url // metadata URI
    );
    recipe_mint = new_recipe_mint, // set as global variable
    recipe_metadata_PDA = new_recipe_metadata_PDA, // set as global variable
    recipe_ata = new_recipe_ata // set as global variable
    console.log('recipe_mint: ', recipe_mint.publicKey.toString())
    console.log('recipe_metadata_PDA: ', recipe_metadata_PDA.toString())
    console.log('recipe_ata: ', recipe_ata.toString())

    let recipeSig = await provider.sendAndConfirm(recipe_mint_tx, [recipe_mint]);
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
        ingredientMints, ingredientAmounts
        )
        .accounts({
          owner: provider.wallet.publicKey,
          recipe: recipe_account,
          recipeTokenAccount: recipe_ata,
          recipeMint: recipe_mint.publicKey,
          recipeMetadata: recipe_metadata_PDA,
          rentAccount: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .signers([wallet])
        .rpc()
      console.log(`${display.green}`,`${display.unicorn} CreateRecipe transaction signature `, create_recipe_tx);

      const created_recipe = await program.account.recipe.fetch(recipe_account);
      console.log('\n')
      console.log(`${display.magenta}`,`${display.popcorn} VERIFY status of Recipe ...`);
      console.log(`${display.white}`,'created recipe ->');
      console.log('mints ', created_recipe.mints.toString());
      console.log('amounts', created_recipe.amounts.map(num => num.toNumber()));

      let recipe_metadata = await provider.connection.getAccountInfo(
        recipe_metadata_PDA
      );
      let recipe_info = MetadataData.deserialize(
        recipe_metadata.data
      );
  
      console.log("recipe metadata ->")
      console.log(recipe_info);
  
      const created_recipe_token = await provider.connection.getParsedAccountInfo(
        recipe_ata
      );
      console.log("recipe token -> ");
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
    console.log('existing recipe: ');
    console.log('mints ', existing_recipe_account.mints.toString());
    console.log('amounts', existing_recipe_account.amounts.map(num => num.toNumber()));

    // exisiting recipe_mint. Created in createRecipe
    console.log('existing_recipe_mint: ', recipe_mint.publicKey.toString())

    const existing_recipe_ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
      TOKEN_PROGRAM_ID, // always token program id
      recipe_mint.publicKey, // mint
      provider.wallet.publicKey // token account destination/authority,
    );
    console.log('existing_recipe_ata: ', existing_recipe_ata.toString())
    // get metadata account
    const existing_recipe_metadata_pda = await getMetadata(recipe_mint.publicKey)
    console.log('existing_recipe_metadata_pda: ', existing_recipe_metadata_pda.toString())
    const existing_recipe_master_edition = await getMasterEdition(recipe_mint.publicKey);
    console.log('existing_recipe_master_edition: ', existing_recipe_master_edition.toString())
    
    // init new Skin NFT
    let lamports = await Token.getMinBalanceRentForExemptMint(
      provider.connection
    );
    const data = skin_data(manager.publicKey);
    let [
      new_skin_mint, 
      new_skin_metadata_PDA, 
      skin_mint_tx,
      new_skin_ata,
    ] = await createSkin(
        provider.wallet.publicKey, // authority/payer
        provider.wallet.publicKey, // destination/owned
        recipe_mint.publicKey, // collection
        lamports, 
        data, // metadata account
        skin_json_url // metadata URI
    );
    // confirm skin NFT accounts were created
    skin_mint = new_skin_mint
    skin_metadata_PDA = new_skin_metadata_PDA
    skin_ata = new_skin_ata
    console.log('skin_mint: ', skin_mint.publicKey.toString())
    console.log('skin_metadata: ', skin_metadata_PDA.toString())
    console.log('manager_skin_ata: ', skin_ata.toString())
    console.log('collection mint: ', recipe_mint.publicKey.toString())

    let skinSig = await provider.sendAndConfirm(skin_mint_tx, [skin_mint]);
    console.log('mint skin signature: ', skinSig);

    // verify collection/recipe of skin
    try {
      const verify_collection = await verifySkinCollection(
        skin_metadata_PDA, // metadata
        provider.wallet.publicKey, // collectionAuthority
        provider.wallet.publicKey, // payer
        recipe_mint.publicKey, // collectionMint
      );
      let verifyTx = new anchor.web3.Transaction({ feePayer: provider.wallet.publicKey });
      verifyTx.add(verify_collection)
          
      let verifySig = await provider.sendAndConfirm(verifyTx, []);
      console.log('verify collection signature: ', verifySig);
    } catch (err) {
      console.log('failed to verify collection: ', err)
    }


    // call anchor program add_skin
    try {
      const add_skin_tx = await program.methods.addSkin(
        recipe_bump
        )
        .accounts({
          owner: provider.wallet.publicKey,
          recipe: recipe_account,
          recipeTokenAccount: recipe_ata,
          recipeMint: recipe_mint.publicKey,
          recipeMetadata: recipe_metadata_PDA,
          skinTokenAccount: skin_ata,
          skinMint: skin_mint.publicKey,
          skinMetadata: skin_metadata_PDA,
          rentAccount: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .signers([wallet])
        .rpc()
      console.log(`${display.green}`,`${display.octopus} AddSkin transaction signature `, add_skin_tx);

      const created_recipe = await program.account.recipe.fetch(recipe_account);
      console.log('\n')
      console.log(`${display.magenta}`,`${display.popcorn} VERIFY status of Skin ...`);
      console.log(`${display.white}`,'existing recipe ->');
      console.log('mints ', created_recipe.mints.toString());
      console.log('amounts', created_recipe.amounts.map(num => num.toNumber()));
  
      let skin_metadata = await provider.connection.getAccountInfo(
        skin_metadata_PDA
      );
      let skin_info = MetadataData.deserialize(
        skin_metadata.data,
      );
  
      console.log("skin metadata ->")
      console.log(skin_info);
  
      let skin_token = await provider.connection.getParsedAccountInfo(
        skin_ata
      );
      console.log("skin token -> ");
      //@ts-ignore
      console.log(skin_token.value.data.parsed.info);
    } catch (err) {
      console.log(`${display.red}`,`${display.bomb} add_skin failed`, err);
    }
  }); // end addSkin

});
