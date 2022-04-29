import * as anchor from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { Program } from "@project-serum/anchor";
import { CraftSkins } from "../target/types/craft_skins";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TOKEN_METADATA_PROGRAM_ID } from "./data/constants";
import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";

import {createMint} from './utils/utils'
import {nft_data, nft_json_url} from "./data/data";
require('dotenv').config()
import { programs } from "@metaplex/js";
const {
  metadata: { MetadataData },
} = programs;

// Configure the client to use the local cluster
let provider = anchor.AnchorProvider.env()
anchor.setProvider(provider);

describe("craft_skins", () => {

  // to see important console.logs, I prefix with cool emojis :)
  let alien = String.fromCodePoint(0x1F47E);
  let bomb = String.fromCodePoint(0x1F4A5)
  let unicorn = String.fromCodePoint(0x1F984)
  let cherry = String.fromCodePoint(0x1F352)

  const program = anchor.workspace.CraftSkins as Program<CraftSkins>;

  let manager: anchor.web3.Keypair
  let user:  anchor.web3.Keypair

  // admin: human
  let program_manager_acc: anchor.web3.PublicKey
  let program_manager_bump: number

  // admin: program PDA
  let program_pda_signer: anchor.web3.PublicKey
  let program_signer_bump: number

  // escrow account to hold ingredient
  let escrow_1: anchor.web3.PublicKey 
  let escrow_bump_1: number

  let recipe_account: anchor.web3.PublicKey
  let recipe_bump: number

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
      console.log(`${alien} Initialize transaction signature `, init_tx);
    } catch (err) {
      console.log(`${bomb} initialize failed `, err)
    }
  }); // end initialize

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
    const data = nft_data(manager.publicKey);
    let [
      recipe_mint, 
      recipe_metadata_PDA, 
      mint_tx,
      manager_recipe_ata
    ] = await createMint(
        provider.connection,
        manager.publicKey, // authority
        provider.wallet.publicKey, // payer
        manager.publicKey, // destination (owner)
        lamports,
        data, // metadata account
        nft_json_url // metadata URI
    );
    console.log('recipe_mint: ', recipe_mint.publicKey.toString())
    console.log('recipe_metadata_PDA: ', recipe_metadata_PDA.toString())
    console.log('manager_recipe_ata: ', manager_recipe_ata.toString())

    let sig = await provider.sendAndConfirm(mint_tx, [recipe_mint, manager]);
    console.log('mint signature: ', sig);

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
      console.log(`${unicorn} CreateRecipe transaction signature `, create_recipe_tx);

      const created_recipe = await program.account.recipe.fetch(recipe_account);
      console.log(` ${cherry} created recipe: `)
      console.log(created_recipe.mints[0].toString());
      console.log(created_recipe.amounts[0].toNumber())
  
      let metadata = await provider.connection.getAccountInfo(
        recipe_metadata_PDA
      );
      let info = MetadataData.deserialize(
        metadata.data
      );
  
      console.log("recipe metadata? ", info.data.creators);
  
      const created_recipe_token = await provider.connection.getParsedAccountInfo(
        manager_recipe_ata
      );
      //@ts-ignore
      console.log("filled tokens? ", created_recipe_token.value.data.parsed.info);
    } catch (err) {
      console.log(`${bomb} create_recipe failed`, err)
    }
  }); // end createRecipe

});
