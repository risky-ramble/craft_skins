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

// Address of deployed program (not needed, just for reference)
// const programId = new anchor.web3.PublicKey("CTvt7mspUNotZfaWNXCtUN2uCjSqxDCyD1nvpNQqixKX");

describe("craft_skins", () => {

  const program = anchor.workspace.CraftSkins as Program<CraftSkins>;

  let manager: anchor.web3.Keypair
  let user:  anchor.web3.Keypair

  // admin: human
  let program_manager_acc: anchor.web3.PublicKey
  let manager_bump: number

  // admin: program PDA
  let program_signer: anchor.web3.PublicKey
  let program_signer_bump: number

  let recipe_account: anchor.web3.PublicKey
  let recipe_bump: number

  // TEST initialize
  it("Is initialized!", async () => {
    // airdrop funds to program manager
    manager = anchor.web3.Keypair.generate();
    let manager_airdrop = await provider.connection.requestAirdrop(
      manager.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(manager_airdrop);

    // airdrop funds to test user
    user = anchor.web3.Keypair.generate();
    let user_airdrop = await provider.connection.requestAirdrop(
      user.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(user_airdrop);

    // init program manager
    [program_manager_acc, manager_bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("manager")],
        program.programId
      );

    let init_tx = await program.methods.initialize()
      .accounts({
        manager: manager.publicKey,
        programManager: program_manager_acc,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([manager])
      .rpc()

    console.log("Initialize transaction signature", init_tx);
  }); // end initialize

  /*
    TEST craft_recipe
    FLOW:
      init 2 fungible tokens, add to ingredientMints, ingredientAmounts
      init program PDA signer => signs for PDAs, like escrow token accounts
      init PDA escrow token accounts for ingredients to be transferred
        => uses ingredientMints as seed
      init recipe account
      init recipe token account
      init recipe mint
      init recipe metadata
      init recipe master edition
  */
  it("Craft recipe!", async () => {

    // program signer => signs for escrow PDAs
    [program_signer, program_signer_bump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from("signer")],
        program.programId
      );

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
    const [
      mint, 
      recipe_metadata_PDA, 
      mint_tx,
      recipe_token_account
    ] = await createMint(
        provider.connection,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
        provider.wallet.publicKey,
        lamports,
        data,
        nft_json_url
    );

    console.log('mint: ', mint.publicKey.toString())
    console.log('recipe_metadata_PDA: ', recipe_metadata_PDA.toString())
    console.log("mint_tx payer: ", mint_tx.feePayer.toString())
    console.log("recipe_token_account: ", recipe_token_account.toString())

    let signer = provider.wallet as anchor.Wallet
    mint_tx.partialSign(signer.payer);
    const buffer = mint_tx.serialize();
    let confirmTx = await program.provider.connection.sendRawTransaction(buffer);
    console.log('confirmed? ', confirmTx)

    //const signers = [manager];
    //await provider.sendAndConfirm(mint_tx);
  
    // init mint account
    let recipe_mint = new Token(provider.connection, mint.publicKey, TOKEN_PROGRAM_ID, manager)

    // associated token account: holds mint, owned by manager
    let manager_recipe_ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      recipe_mint.publicKey,
      manager.publicKey
    );

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

    // call anchor program create_recipe
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

    console.log("CreateRecipe transaction signature", create_recipe_tx);
  }); // end createRecipe

});
