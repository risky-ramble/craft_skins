import { programs } from '@metaplex/js';
import { Transaction } from '@metaplex-foundation/mpl-core';
import { Keypair, PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    MintLayout,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { TOKEN_METADATA_PROGRAM_ID } from '../data/constants';
import { Token } from '@solana/spl-token';
import * as anchor from '@project-serum/anchor'
import { CreateMasterEditionV3, MetadataData } from "@metaplex-foundation/mpl-token-metadata"

const { Metadata, MetadataDataData, CreateMetadata, Creator } = programs.metadata;

export const createMint = async (
    connection: Connection,
    authority: PublicKey,
    fee_payer: PublicKey,
    dest_owner: PublicKey,
    lamports,
    data,
    url
): Promise<[Keypair, PublicKey, programs.core.Transaction, PublicKey]> => {
    const mint = Keypair.generate();
    console.log(`https://solscan.io/token/${mint.publicKey.toString()}`);

    const tx_mint = new Transaction({ feePayer: fee_payer });
    let ata = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID, // always associated token program id
      TOKEN_PROGRAM_ID, // always token program id
      mint.publicKey, // mint
      dest_owner // token account authority,
    );
    tx_mint.add(
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
        authority,
        authority
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
        authority,
        [],
        1
      )
    );
  
    const metadataPDA = await Metadata.getPDA(mint.publicKey);
  
    const metadataData = new MetadataDataData({
      name: data.name,
      symbol: data.symbol,
      uri: url,
      sellerFeeBasisPoints: data.seller_fee_basis_points,
      creators: [
        new Creator({
          address: fee_payer.toString(),
          verified: true,
          share: 100,
        })
      ],
    });
  
  
  
    const tx_metadata = new CreateMetadata(
      {
        feePayer: fee_payer,
      },
      {
        metadata: metadataPDA,
        metadataData,
        updateAuthority: authority,
        mint: mint.publicKey,
        mintAuthority: authority,
      }
    );
    
  
    const tx = Transaction.fromCombined([ tx_mint, tx_metadata ]);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  
    return [ mint, metadataPDA, tx, ata ];
}


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


export async function getMetadataData(
    connection: anchor.web3.Connection,
    metadata: PublicKey,
): Promise<MetadataData> {
    const metadataAccount = await connection.getAccountInfo(metadata);
    return MetadataData.deserialize(metadataAccount.data);
};