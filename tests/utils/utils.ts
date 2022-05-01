import * as anchor from "@project-serum/anchor";
import { programs } from "@metaplex/js";
import {
  Keypair,
  PublicKey,
  SystemProgram
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { TOKEN_METADATA_PROGRAM_ID } from '../data/constants'
import {
  createCreateMetadataAccountV2Instruction,
  DataV2,
  Collection,
  createCreateMasterEditionV3Instruction,
  createVerifyCollectionInstruction,
  VerifyCollectionInstructionAccounts
} from "@metaplex-foundation/mpl-token-metadata";

import { Token } from "@solana/spl-token";
const { MetadataProgram, Metadata} =
  programs.metadata;
const Transaction = programs.core.Transaction;

export async function createRecipe(
  fee_payer: PublicKey,
  dest_owner: PublicKey,
  lamports,
  data,
  recipe_json_url
): Promise<[Keypair, PublicKey, programs.core.Transaction, PublicKey]> {
  const mint = Keypair.generate();
  const tx = new Transaction({ feePayer: fee_payer });
  let ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
    TOKEN_PROGRAM_ID, // always token program id
    mint.publicKey, // mint
    dest_owner // token account authority,
  );
  tx.add(
    // create mint
    SystemProgram.createAccount({
      fromPubkey: fee_payer,
      newAccountPubkey: mint.publicKey,
      space: MintLayout.span,
      lamports: lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      0,
      fee_payer,
      fee_payer
    ),
    // create token account
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      ata,
      dest_owner,
      fee_payer
    ),
    // mint to token account
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      ata,
      fee_payer,
      [],
      1
    )
  );

  let [metadata_instruction, metadataPDA] = await createRecipeMetadata(
    mint.publicKey,
    recipe_json_url,
    data,
    fee_payer
  );
  tx.add(metadata_instruction)

  const masterAccount = await getMasterEdition(mint.publicKey);
  /*
  const masterEdTX = new programs.metadata.CreateMasterEditionV3(
    { feePayer: fee_payer },
    {
      edition: masterAccount,
      metadata: metadataPDA,
      updateAuthority: fee_payer,
      mint: mint.publicKey,
      mintAuthority: fee_payer,
    }
  );
  */
  const master_edition_instruction = createCreateMasterEditionV3Instruction(
    {
      edition: masterAccount,
      mint: mint.publicKey,
      updateAuthority: fee_payer,
      mintAuthority: fee_payer,
      payer: fee_payer,
      metadata: metadataPDA
    },
    {
      createMasterEditionArgs: {maxSupply: null}
    }

  );
  tx.add(master_edition_instruction)

  return [mint, metadataPDA, tx, ata];
}

export const createRecipeMetadata = async (
  mintKey: anchor.web3.PublicKey,
  uri: string,
  metadata: any,
  creator: anchor.web3.PublicKey,
): Promise<[anchor.web3.TransactionInstruction, anchor.web3.PublicKey]> => {
  // Retrieve metadata
  const metadataAccount = await Metadata.getPDA(mintKey);

  let data: DataV2 = {
    name: metadata.name,
    symbol: metadata.symbol,
    uri: uri,
    sellerFeeBasisPoints: metadata.seller_fee_basis_points,
    creators: [
      {
        address: creator,
        verified: true,
        share: 100,
      },
    ],
    collection: null,
    uses: null,
  }
  
  const instructions = createCreateMetadataAccountV2Instruction(
    {
      metadata: metadataAccount,
      mint: mintKey,
      mintAuthority: creator,
      payer: creator,
      updateAuthority: creator,
    },
    { createMetadataAccountArgsV2: {data, isMutable: true} }
  );

  return [instructions, metadataAccount];
};


export async function createSkin(
  fee_payer: PublicKey,
  dest_owner: PublicKey,
  collection_mint: PublicKey,
  lamports,
  data,
  skin_json_url
): Promise<[Keypair, PublicKey, programs.core.Transaction, PublicKey]> {
  const mint = Keypair.generate();
  const tx = new Transaction({ feePayer: fee_payer });
  let ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
    TOKEN_PROGRAM_ID, // always token program id
    mint.publicKey, // mint
    dest_owner // token account authority,
  );
  tx.add(
    // create mint
    SystemProgram.createAccount({
      fromPubkey: fee_payer,
      newAccountPubkey: mint.publicKey,
      space: MintLayout.span,
      lamports: lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      0,
      fee_payer,
      fee_payer
    ),
    // create token account
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      ata,
      dest_owner,
      fee_payer
    ),
    // mint to token account
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      ata,
      fee_payer,
      [],
      1
    )
  );


  // create metadata account
  const metadataPDA = await Metadata.getPDA(mint.publicKey)
  let metadata_instruction = await createSkinMetadata(
    mint.publicKey,
    skin_json_url,
    data,
    fee_payer,
    collection_mint
  );
  tx.add(metadata_instruction)

  // verify collection here
  const recipe_edition = await getMasterEdition(collection_mint);
  const recipe_metadata = await Metadata.getPDA(collection_mint);
  const verify_collection_instruction = await verifySkinCollection(
    metadataPDA, // metadata
    fee_payer, // collectionAuthority
    fee_payer, // payer
    collection_mint, // collectionMint
    recipe_metadata, // collection
    recipe_edition // collectionMasterEditionAccount
  );
  //tx.add(verify_collection_instruction)


  return [mint, metadataPDA, tx, ata];
}

export const createSkinMetadata = async (
  mintKey: anchor.web3.PublicKey,
  uri: string,
  metadata: any,
  creator: anchor.web3.PublicKey,
  collection: anchor.web3.PublicKey
): Promise<anchor.web3.TransactionInstruction> => {
  // Retrieve metadata
  const metadataAccount = await Metadata.getPDA(mintKey);
  let data: DataV2 = {
    name: metadata.name,
    symbol: metadata.symbol,
    uri: uri,
    sellerFeeBasisPoints: metadata.seller_fee_basis_points,
    creators: [
      {
        address: creator,
        verified: true,
        share: 100,
      },
    ],
    collection: collection ? { key: collection, verified: false} : null,
    uses: null,
  }

  const instruction = createCreateMetadataAccountV2Instruction(
    {
      metadata: metadataAccount,
      mint: mintKey,
      mintAuthority: creator,
      payer: creator,
      updateAuthority: creator,
    },
    { createMetadataAccountArgsV2: {data, isMutable: true}
    }
  );

  return instruction;
};

export const verifySkinCollection = async (
  metadata: PublicKey,
  collectionAuthority: PublicKey,
  payer: PublicKey,
  collectionMint: PublicKey,
  collection: PublicKey,
  collectionMasterEditionAccount: PublicKey
): Promise<anchor.web3.TransactionInstruction> => {
  let params: VerifyCollectionInstructionAccounts = {
    metadata: metadata,
    collectionAuthority: collectionAuthority,
    payer: payer,
    collectionMint: collectionMint,
    collection: collection,
    collectionMasterEditionAccount: collectionMasterEditionAccount   
  }
  return createVerifyCollectionInstruction(params);
}

//run program instruction after metadata creation takes in current iou and size
export const getMasterEdition = async (
  mint: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
        Buffer.from("edition"),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};

export const getMetadata = async (
  mint: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey> => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    )
  )[0];
};