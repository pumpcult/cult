import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import bs58 from "bs58";
import { env } from "../config/env";
import { PUMPFUN_BASE_URL } from "../config/constants";
import { PumpfunLaunchResult, TokenMetadataInput } from "../types";
import { uploadMetadata } from "./metadata";

const PUMP_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
);
const PUMP_GLOBAL = new PublicKey(
  "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
);
const PUMP_MINT_AUTHORITY = new PublicKey(
  "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM",
);
const PUMP_EVENT_AUTHORITY = new PublicKey(
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1",
);
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const CREATE_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);

const decodeSecretKey = (secret: string): Uint8Array => {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const raw = JSON.parse(trimmed) as number[];
    return Uint8Array.from(raw);
  }
  return bs58.decode(trimmed);
};

const encodeString = (value: string): Buffer => {
  const data = Buffer.from(value, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length, 0);
  return Buffer.concat([len, data]);
};

const resolveComputeUnitPrice = async (
  connection: Connection,
): Promise<number> => {
  try {
    const fees = await connection.getRecentPrioritizationFees();
    if (!fees.length) return 0;
    const total = fees.reduce(
      (sum, fee) => sum + (fee.prioritizationFee ?? 0),
      0,
    );
    return Math.floor(total / fees.length);
  } catch {
    return 0;
  }
};

const deriveMetadataPda = (mint: PublicKey): PublicKey => {
  const [metadata] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );
  return metadata;
};

const deriveBondingCurvePda = (mint: PublicKey): PublicKey => {
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  return bondingCurve;
};

const buildCreateInstruction = async (
  mint: PublicKey,
  user: PublicKey,
  name: string,
  symbol: string,
  uri: string,
): Promise<TransactionInstruction> => {
  const bondingCurve = deriveBondingCurvePda(mint);
  const associatedBondingCurve = await getAssociatedTokenAddress(
    mint,
    bondingCurve,
    true,
  );
  const metadata = deriveMetadataPda(mint);

  const keys = [
    { pubkey: mint, isSigner: true, isWritable: true },
    { pubkey: PUMP_MINT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
    { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: metadata, isSigner: false, isWritable: true },
    { pubkey: user, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const data = Buffer.concat([
    CREATE_DISCRIMINATOR,
    encodeString(name),
    encodeString(symbol),
    encodeString(uri),
  ]);

  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys,
    data,
  });
};

export const launchToken = async (
  metadataInput: TokenMetadataInput,
): Promise<PumpfunLaunchResult> => {
  const connection = new Connection(env.solanaRpcUrl, "confirmed");
  const deployer = Keypair.fromSecretKey(
    decodeSecretKey(env.pumpfunDeployerPrivateKey),
  );
  const mint = Keypair.generate();

  const uploaded = await uploadMetadata(metadataInput);

  const instructions: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 250000 }),
  ];
  const computeUnitPrice = await resolveComputeUnitPrice(connection);
  if (computeUnitPrice > 0) {
    instructions.push(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: computeUnitPrice,
      }),
    );
  }

  instructions.push(
    await buildCreateInstruction(
      mint.publicKey,
      deployer.publicKey,
      metadataInput.name,
      metadataInput.symbol,
      uploaded.metadataUri,
    ),
  );

  const latestBlockhash = await connection.getLatestBlockhash("finalized");
  const tx = new Transaction();
  tx.feePayer = deployer.publicKey;
  tx.recentBlockhash = latestBlockhash.blockhash;
  tx.add(...instructions);
  tx.sign(deployer, mint);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });

  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    },
    "confirmed",
  );

  if (confirmation.value.err) {
    throw new Error(
      `Pump.fun launch failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }

  const mintAddress = mint.publicKey.toBase58();

  return {
    mintAddress,
    pumpfunUrl: `${PUMPFUN_BASE_URL}/${mintAddress}`,
    txSignature: signature,
    metadataUri: uploaded.metadataUri,
  };
};
