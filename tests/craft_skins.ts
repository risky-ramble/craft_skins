import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { CraftSkins } from "../target/types/craft_skins";

describe("craft_skins", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.CraftSkins as Program<CraftSkins>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initialize().rpc();
    console.log("Your transaction signature", tx);
  });
});
