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
import { Token } from "@solana/spl-token";
import {
  createCreateMetadataAccountV2Instruction,
  DataV2,
  createCreateMasterEditionV3Instruction,
  createVerifyCollectionInstruction,
  VerifyCollectionInstructionAccounts
} from "@metaplex-foundation/mpl-token-metadata";
import { BN } from "bn.js";
const Transaction = programs.core.Transaction;
const { metadata: { MetadataData, MetadataProgram, MasterEdition } } = programs;


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

  const metadata = await programs.metadata.Metadata.getPDA(mint.publicKey);
  let metadata_instruction = await createRecipeMetadata(
    mint.publicKey,
    recipe_json_url,
    data,
    fee_payer
  );
  tx.add(metadata_instruction)

  const edition = await getMasterEdition(mint.publicKey);
  const master_edition_instruction = await createRecipeMasterEdition(
    edition,
    mint.publicKey,
    fee_payer
  );
  tx.add(master_edition_instruction)

  return [mint, metadata, tx, ata];
}

export const createRecipeMasterEdition = async (
  edition: PublicKey,
  mint: PublicKey,
  feePayer: PublicKey
): Promise<programs.metadata.CreateMasterEditionV3> => {
  const metadata = await programs.metadata.Metadata.getPDA(mint)
  const master_edition_instruction = new programs.metadata.CreateMasterEditionV3(
    {feePayer: feePayer},
    {
      edition: edition,
      metadata: metadata,
      updateAuthority: feePayer,
      mint: mint,
      mintAuthority: feePayer,
      maxSupply: new BN(0)
    }
  );
  return master_edition_instruction
}

export const createRecipeMetadata = async (
  mintKey: anchor.web3.PublicKey,
  uri: string,
  info: any,
  creator: anchor.web3.PublicKey,
): Promise<anchor.web3.TransactionInstruction> => {
  // Retrieve metadata
  const metadata = await programs.metadata.Metadata.getPDA(mintKey);

  let data: DataV2 = {
    name: info.name,
    symbol: info.symbol,
    uri: uri,
    sellerFeeBasisPoints: info.seller_fee_basis_points,
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
  
  const instruction = createCreateMetadataAccountV2Instruction(
    {
      metadata,
      mint: mintKey,
      mintAuthority: creator,
      payer: creator,
      updateAuthority: creator,
    },
    { createMetadataAccountArgsV2: {data, isMutable: true} }
  );

  return instruction;
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
  const metadataPDA = await programs.metadata.Metadata.getPDA(mint.publicKey)
  let metadata_instruction = await createSkinMetadata(
    mint.publicKey,
    skin_json_url,
    data,
    fee_payer,
    collection_mint
  );
  tx.add(metadata_instruction)


  return [mint, metadataPDA, tx, ata];
}

export const createSkinMetadata = async (
  mintKey: anchor.web3.PublicKey,
  uri: string,
  info: any,
  creator: anchor.web3.PublicKey,
  collection: anchor.web3.PublicKey
): Promise<anchor.web3.TransactionInstruction> => {
  // Retrieve metadata
  const metadata = await programs.metadata.Metadata.getPDA(mintKey);
  let data: DataV2 = {
    name: info.name,
    symbol: info.symbol,
    uri: uri,
    sellerFeeBasisPoints: info.seller_fee_basis_points,
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
      metadata,
      mint: mintKey,
      mintAuthority: creator,
      payer: creator,
      updateAuthority: creator,
    },
    { createMetadataAccountArgsV2: {data: data, isMutable: true} }
  );

  return instruction;
};

export const verifySkinCollection = async (
  metadata: PublicKey,
  collectionAuthority: PublicKey,
  payer: PublicKey,
  collectionMint: PublicKey,
): Promise<programs.metadata.VerifyCollection> => {
  const collectionMasterEdition = await MasterEdition.getPDA(collectionMint)
  const collectionMetadata = await programs.metadata.Metadata.getPDA(collectionMint);

  /*
  let params: VerifyCollectionInstructionAccounts = {
    metadata: metadata,
    collectionAuthority: collectionAuthority,
    payer: payer,
    collectionMint: collectionMint,
    collection: collectionMetadata,
    collectionMasterEditionAccount: collectionMasterEdition   
  }
  return createVerifyCollectionInstruction(params);
  */
  //   verify collection here
  const collectionTX = new programs.metadata.VerifyCollection(
    { feePayer: payer },
    {
      metadata: metadata,
      collectionAuthority: collectionAuthority,
      collectionMint: collectionMint,
      collectionMetadata: collectionMetadata,
      collectionMasterEdition: collectionMasterEdition,
    }
  );
  return collectionTX;
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