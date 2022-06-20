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
  AccountLayout,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { TOKEN_METADATA_PROGRAM_ID } from '../data/constants'
import { Token } from "@solana/spl-token";
import {
  createCreateMetadataAccountV2Instruction,
  DataV2,
  createVerifyCollectionInstruction,
} from "@metaplex-foundation/mpl-token-metadata";
import { BN } from "bn.js";
const Transaction = programs.core.Transaction;
const { metadata: { MetadataProgram, MasterEdition } } = programs;


export async function createRecipe(
  fee_payer: PublicKey,
  dest_owner: PublicKey,
  lamports,
  data,
  recipe_json_url
): Promise<[Keypair, PublicKey, programs.core.Transaction, PublicKey, PublicKey]> {
  const mint = Keypair.generate();
  const tx = new Transaction({ feePayer: fee_payer });
  let ata = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
    TOKEN_PROGRAM_ID, // always token program id
    mint.publicKey, // mint
    dest_owner, // token account authority,
    true
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

  return [mint, metadata, tx, ata, edition];
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
    dest_owner, // token account authority,
    true
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

export const getRecipeAccount = async (
  recipe_mint: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey
): Promise<[anchor.web3.PublicKey, number]> => {
  return (
    // creates Recipe account PDA (address)
    await anchor.web3.PublicKey.findProgramAddress(
      [
        Buffer.from("recipe"), // arbitrary data
        recipe_mint.toBuffer() // collection NFT mint (inside skin metadata)
      ],
      programId
    )
  );
}

export const createRecipeAccount = async (
  recipe_mint: anchor.web3.PublicKey,
  programId: anchor.web3.PublicKey,
  payer: anchor.web3.PublicKey,
  lamports: number
): Promise<[programs.core.Transaction, PublicKey]> => {

  const tx = new Transaction({ feePayer: payer });
  let [recipe_PDA, _] = await getRecipeAccount(recipe_mint, programId);

  tx.add(
    // create mint
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: recipe_PDA,
      lamports: lamports,
      space: 240,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  return [tx, recipe_PDA];
}


export async function createNewIngredient(
  mint: PublicKey,
  fee_payer: PublicKey,
  dest_owner: PublicKey,
  lamports,
  amount
): Promise<programs.core.Transaction> {
  const tx = new Transaction({ feePayer: fee_payer });

  let token = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
    TOKEN_PROGRAM_ID, // always token program id
    mint, // mint
    dest_owner // token account authority,
  );

  tx.add(
    // create mint
    SystemProgram.createAccount({
      fromPubkey: fee_payer,
      newAccountPubkey: mint,
      space: MintLayout.span,
      lamports: lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    // fungible token mint
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      1,
      fee_payer,
      fee_payer
    ),
    // create token account
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      mint,
      token,
      dest_owner,
      fee_payer
    ),
    // mint to token account
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      token,
      fee_payer,
      [],
      amount
    )
  );

  return tx;
}

export const airdropIngredient = async (
  ingredientMint: PublicKey,
  owner: PublicKey,
  newOwner: PublicKey,
  amount: number
): Promise<programs.core.Transaction> => {
  const tx = new Transaction({ feePayer: owner });

  let from = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
    TOKEN_PROGRAM_ID, // always token program id
    ingredientMint, // mint
    owner // token account authority,
  );
  let to = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
    TOKEN_PROGRAM_ID, // always token program id
    ingredientMint, // mint
    newOwner // token account authority,
  );

  tx.add(
    // create token account
    Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      ingredientMint,
      to,
      newOwner,
      owner
    ),
    // transfer ingredient
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID, 
      from, 
      to, 
      owner, 
      [], 
      amount
    )
  );

  return tx;
}

