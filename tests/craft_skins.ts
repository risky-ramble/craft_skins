import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { CraftSkins } from "../target/types/craft_skins";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TOKEN_METADATA_PROGRAM_ID } from "./data/constants";
import { ASSOCIATED_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";

import { programs } from "@metaplex/js";
import { PublicKey } from "@solana/web3.js";
const {
  metadata: { MetadataData },
} = programs;

/*
// Read the generated IDL.
const idl = JSON.parse(
  require("fs").readFileSync("./target/idl/craft_skins.json", "utf8")
);
// Address of the deployed program
const programId = new anchor.web3.PublicKey("CTvt7mspUNotZfaWNXCtUN2uCjSqxDCyD1nvpNQqixKX");
// Generate the program client from IDL
const program = new anchor.Program(idl, programId);
*/

describe("craft_skins", () => {
  // Configure the client to use the local cluster.
  let provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);

  const program = anchor.workspace.CraftSkins as Program<CraftSkins>;

  let manager: anchor.web3.Keypair
  let user:  anchor.web3.Keypair

  let program_manager_acc: anchor.web3.PublicKey
  let manager_bump: number


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

    const tx = await program.rpc.initialize({
      accounts: {
        manager: manager.publicKey,
        programManager: program_manager_acc,
        systemProgram: anchor.web3.SystemProgram.programId
      },
      signers: [manager]
    });
    console.log("Your transaction signature", tx);
  });
});
