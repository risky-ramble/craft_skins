import * as anchor from "@project-serum/anchor";
import { PublicKey, AccountMeta } from "@solana/web3.js";
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
  verifySkinCollection,
  getRecipeAccount,
  createNewIngredient,
  airdropIngredient
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

  let program_signer: anchor.web3.PublicKey
  let program_signer_bump: number

  // stores recipe as mints[] + amounts[]
  let recipe_account: anchor.web3.PublicKey
  let recipe_bump: number

  let recipe_mint: anchor.web3.Keypair
  let recipe_metadata_PDA: anchor.web3.PublicKey
  let recipe_ata: anchor.web3.PublicKey
  let recipe_master_edition: anchor.web3.PublicKey

  let skin_mint: anchor.web3.Keypair
  let skin_metadata_PDA: anchor.web3.PublicKey
  let skin_ata: anchor.web3.PublicKey

  let ingredient: anchor.web3.Keypair = anchor.web3.Keypair.generate();

/** ============================================================================================
                                        I N I T I A L I Z E   
    ============================================================================================  
**/

  // TEST initialize
  it("Is initialized", async () => {

    // airdrop funds to program manager
    manager = anchor.web3.Keypair.generate();
    let airdrop = await provider.connection.requestAirdrop(manager.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    console.log('confirmed manager airdrop? ', await provider.connection.confirmTransaction(airdrop));

    // init program manager
    [program_manager_acc, program_manager_bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("manager")],
        program.programId
      );

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
    let lamports = await Token.getMinBalanceRentForExemptMint(provider.connection);
    const data = recipe_nft_data(manager.publicKey);
    let [
      new_recipe_mint, 
      new_recipe_metadata_PDA, 
      recipe_mint_tx,
      new_recipe_ata,
      new_recipe_master_edition
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
    recipe_master_edition = new_recipe_master_edition
    let recipeSig = await provider.sendAndConfirm(recipe_mint_tx, [recipe_mint]);

    // get PDA of Recipe account, which stores {mints[], amounts[]} needed to craft a skin
    [recipe_account, recipe_bump] = await getRecipeAccount(
      recipe_mint.publicKey,
      program.programId
    );

    // create test ingredient, send to admin for safekeeping
    let airdrop_tx = await createNewIngredient(
      ingredient.publicKey,
      provider.wallet.publicKey,
      provider.wallet.publicKey,
      lamports,
      100
      );
    let sig = await provider.sendAndConfirm(airdrop_tx, [ingredient]);
    console.log('airdrop ingredient to admin:', sig)

    // test ingredient
    let ingredientMints = []
    ingredientMints.push(ingredient.publicKey);
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
          recipeMasterEdition: recipe_master_edition,
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
      let [recipe_info, _] = Metadata.fromAccountInfo(recipe_metadata);
  
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
    let skinSig = await provider.sendAndConfirm(skin_mint_tx, [skin_mint]);
    console.log('mint skin signature: ', skinSig);

    // verify collection/recipe of skin
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
          recipeMasterEdition: recipe_master_edition,
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
      let [skin_info, __] = Metadata.fromAccountInfo(skin_metadata);
  
      let recover_collection_key: PublicKey = new PublicKey(skin_info.collection.key);
      console.log('skin collection: ', recover_collection_key.toString())

      let [collection_recipe_account, _] = await getRecipeAccount(recover_collection_key, program.programId);
      console.log('collection recipe: ', collection_recipe_account.toString())

      console.log("skin recipe == created recipe? ");
      // recipe found from skin.metadata.collection
      let found_recipe = await program.account.recipe.fetch(collection_recipe_account);
      // recipe created in CreateRecipe
      let correct_recipe = await program.account.recipe.fetch(recipe_account)
      // check skin recipe is the correct recipe?
      let skinIngredientMints = found_recipe.mints.map(mint => mint.toString());
      let skinIngredientAmounts = found_recipe.amounts.map(amount => amount.toNumber());
      let recipeIngredientMints = correct_recipe.mints.map(mint => mint.toString());
      let recipeIngredientAmounts = correct_recipe.amounts.map(amount => amount.toNumber());
      console.log(skinIngredientMints, ' == ', recipeIngredientMints)
      console.log(skinIngredientAmounts, ' == ', recipeIngredientAmounts)

    } catch (err) {
      console.log(`${display.red}`,`${display.bomb} add_skin failed`, err);
    }
  }); // end addSkin

/** ============================================================================================
                                  C R A F T      S K I N   
    ============================================================================================   
**/

  it("Craft skin", async () => {

    // create test user
    const user = anchor.web3.Keypair.generate();
    console.log('user: ', manager.publicKey.toString())
    let airdrop = await provider.connection.requestAirdrop(user.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    console.log('confirmed user airdrop? ', await provider.connection.confirmTransaction(airdrop));

    let airdrop_tx = await airdropIngredient(
      ingredient.publicKey, // ingredient mint to transfer
      provider.wallet.publicKey, // owner
      user.publicKey, // new owner
      10 // amount to transfer
    );
    let sig = await provider.sendAndConfirm(airdrop_tx);

    // receive skin mint from client
    let skinToBuy = skin_mint.publicKey;
    // user skin ATA (to receive)
    let skinToATA = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      skin_mint.publicKey,
      user.publicKey,
    );
    // owner of skin (to send). This is provider.wallet
    let skinFromATA = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      skin_mint.publicKey,
      provider.wallet.publicKey
    );
    // find skin metadata
    let skinMetadataPDA = skin_metadata_PDA;
    // find metadata.collectionMint
    let skinMetadata = await provider.connection.getAccountInfo(
      skinMetadataPDA
    );
    // skin.metadata.data
    let [metadataData, ___] = Metadata.fromAccountInfo(skinMetadata);

    // skin.metadata.data.collection.key
    let skinCollectionMint: PublicKey = new PublicKey(metadataData.collection.key);
    // find collectionMetadata
    let skinCollectionMetadata = await programs.metadata.Metadata.getPDA(skinCollectionMint);
    // find collectionMasterEdition
    let skinCollectionMasterEdition = await programs.metadata.MasterEdition.getPDA(skinCollectionMint);
    // find collectionTokenAccount => PDA of collectionMint + owner pubkey
    let skinCollectionATA = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      skinCollectionMint,
      provider.wallet.publicKey
    );
    // find recipe PDA from collectionMint
    let [skinRecipePDA, _] = await getRecipeAccount(skinCollectionMint, program.programId);
    // recipe account (mints[], amounts[])
    let skinRecipe = await program.account.recipe.fetch(skinRecipePDA);

    // find user token accounts for each recipe mint
    let user_tokens: anchor.web3.PublicKey[] = [];
    for (let i = 0; i < skinRecipe.mints.length; i++) {
      let token = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        skinRecipe.mints[i],
        user.publicKey
      );
      user_tokens.push(token);
    }

    // create signer for all program escrow trxs
    [program_signer, program_signer_bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("signer")],
        program.programId
      );

    // find program escrow PDAs to transfer each ingredient mint to
    let escrow_tokens: anchor.web3.PublicKey[] = [];
    for (let x = 0; x < user_tokens.length; x++) {
      // program escrow PDA derived from user ingredient token account + "escrow" string
      let escrow = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
        TOKEN_PROGRAM_ID, // always token program id
        skinRecipe.mints[x], // mint
        program_signer, // token account authority,
        true
      );
      escrow_tokens.push(escrow);
    }
 
    // construct remaining accounts[]
    let remaining_accounts: AccountMeta[] = []
    for (let k = 0; k < escrow_tokens.length; k++) {
      // add user ingredient tokens
      remaining_accounts.push({pubkey: user_tokens[k], isSigner: false, isWritable: true});
      // add user_token.mint as Mint account
      remaining_accounts.push({pubkey: skinRecipe.mints[k], isSigner: false, isWritable: true})
      // add program escrow PDAs to hold user tokens
      remaining_accounts.push({pubkey: escrow_tokens[k], isSigner: false, isWritable: true})
    }
    console.log('remaining accounts ', remaining_accounts.map(account => {
      return account.pubkey.toString()
    }))

    try {
      const craft_skin_tx = await program.methods.craftSkin()
        .accounts({
          owner: provider.wallet.publicKey,
          user: user.publicKey,
          programSigner: program_signer,
          recipe: skinRecipePDA,
          recipeTokenAccount: skinCollectionATA,
          recipeMint: skinCollectionMint,
          recipeMetadata: skinCollectionMetadata,
          recipeMasterEdition: skinCollectionMasterEdition,
          userSkinTokenAccount: skinToATA,
          skinTokenAccount: skinFromATA,
          skinMint: skinToBuy,
          skinMetadata: skinMetadataPDA,
          rentAccount: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          ataProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .remainingAccounts(remaining_accounts)
        .signers([wallet, user])
        .rpc()
      console.log(`${display.green}`,`${display.grapes} CraftSkin transaction signature `, craft_skin_tx);
    } catch (err) {
      console.log(`${display.red}`,`${display.bomb} craft_skin failed`, err);
    }

  }); // end craftSkin

});
