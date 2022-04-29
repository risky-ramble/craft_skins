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

  const connection = new anchor.web3.Connection("https://localhost:8899/");

  const program = anchor.workspace.CraftSkins as Program<CraftSkins>;

  let manager: anchor.web3.Keypair
  let user:  anchor.web3.Keypair

  // admin: human
  let program_manager_acc: anchor.web3.PublicKey
  let program_manager_bump: number

  // admin: program PDA
  let program_signer: anchor.web3.PublicKey
  let program_signer_bump: number

  let recipe_account: anchor.web3.PublicKey
  let recipe_bump: number

  // TEST initialize
  it("Is initialized", async () => {

    // airdrop funds to program manager
    manager = anchor.web3.Keypair.generate();
    console.log('manager: ', manager.publicKey.toString())
    const managerSig = await provider.connection.requestAirdrop(manager.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    console.log('manager airdrop? ', await provider.connection.confirmTransaction(managerSig));
    
    // airdrop funds to test user
    user = anchor.web3.Keypair.generate();
    console.log('user: ', user.publicKey.toString())
    const userSig = await provider.connection.requestAirdrop(user.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    console.log('user airdrop? ', await provider.connection.confirmTransaction(userSig));

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

    // program signer => signs for escrow PDAs
    [program_signer, program_signer_bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("signer")],
        program.programId
      );
    console.log('program_signer: ', program_signer.toString())
    console.log('program_manager_acc: ', program_manager_acc.toString())

    /*
      necessary accounts to make NFT:
        associated token account (ata) => owned by user, holds mint
        mint account => address of NFT
        metadata account => holds arbitrary data to customize NFT
        master edition account => defines NFT as 1/1 (can't print copies)
    */
    // lamports (SOL) required to make mint Account rent exempt
    let lamports = await Token.getMinBalanceRentForExemptMint(
      provider.connection
    );
    const data = nft_data(manager.publicKey);
    let [
      mint, 
      recipe_metadata_PDA, 
      mint_tx,
      manager_recipe_ata
    ] = await createMint(
        provider.connection,
        provider.wallet.publicKey, // authority
        provider.wallet.publicKey, // payer
        manager.publicKey, // destination (owner)
        lamports,
        data, // metadata account
        nft_json_url // metadata URI
    );

    // init mint account
    let signer = (provider.wallet as anchor.Wallet).payer
    let recipe_mint = new Token(connection, mint.publicKey, TOKEN_PROGRAM_ID, signer)
    console.log('recipe_mint: ', recipe_mint.publicKey.toString())

    console.log('recipe_metadata_PDA: ', recipe_metadata_PDA.toString())
    console.log("manager_recipe_ata: ", manager_recipe_ata.toString())

    mint_tx = await provider.wallet.signTransaction(mint_tx)

    // turn transaction into Buffer (binary array), does validation in the process
    let dehydrated = mint_tx.serialize()
    console.log('cereal')
  
    let txhash = await provider.connection.sendRawTransaction(dehydrated)  
    console.log('mint tx hash: ', txhash)
    console.log('mint confirmed? ', await provider.connection.confirmTransaction(txhash));

    // test ingredients
    let ingredientMints = []
    ingredientMints.push(new PublicKey("Gvgxm6wRv9rkWdFqB4GSVt7DbetZJzedJV1JbJtJHtuh"));
    let ingredientAmounts = []
    ingredientAmounts.push(new BN(10));

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

    // call anchor program create_recipe
    try {
      const create_recipe_tx = await program.methods.createRecipe(
        ingredientMints, ingredientAmounts, program_signer_bump
        )
        .accounts({
          manager: manager.publicKey,
          programManager: program_manager_acc,
          programPdaSigner: program_signer,
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
    } catch (err) {
      console.log(`${bomb} create_recipe failed`, err)
    }
  }); // end createRecipe

});
