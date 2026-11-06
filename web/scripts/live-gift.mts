/**
 * Live Whitechain gate. Sends a real gasless gift through the running app and worker, then checks
 * the result on chain 1874. Usage:
 *   pnpm test:live --preflight     # balances, roles and configuration only
 *   pnpm test:live                 # one real gift, asserted on chain
 *   pnpm test:live --refund        # short-expiry gift, waits for the real permissionless return
 */
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  hexlify,
  keccak256,
  randomBytes,
  formatEther,
} from "ethers";
import {
  authorizationTypes,
  explorerTx,
  giftNonce,
  TOKEN_DOMAIN,
  USDT_ADDRESS,
  vaultAbi,
  ZeroHash,
  type GiftTerms,
} from "../src/lib/chain";
import { required, rpcUrl } from "../src/lib/server/config";
import type { GiftView } from "../src/lib/types";

const args = process.argv.slice(2);
const refund = args.includes("--refund");
const preflightOnly = args.includes("--preflight");
const amount = 1_000_000n; // $1.00 official test USDT
const app = process.env.APP_URL || "http://localhost:3000";
const provider = new JsonRpcProvider(rpcUrl());
const token = new Contract(
  USDT_ADDRESS,
  ["function balanceOf(address) view returns(uint256)"],
  provider,
);
const problems: string[] = [];

function check(ok: unknown, message: string) {
  if (!ok) problems.push(message);
}
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Live check failed: ${message}`);
}

let cookie = "";
async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${app}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined
        ? {}
        : { "content-type": "application/json", origin: new URL(app).origin }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(`${path} returned ${response.status}: ${data.error || "no message"}`);
  return data as T;
}
async function waitFor(giftId: string, status: GiftView["status"], seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const gift = await call<GiftView>(`gifts/${giftId}`);
    if (gift.status === status) return gift;
    if (gift.status === "failed") throw new Error(`Gift failed: ${gift.error}`);
    await new Promise((r) => setTimeout(r, 4_000));
  }
  throw new Error(`Gift did not reach "${status}" within ${seconds}s. Is \`pnpm worker\` running?`);
}

try {
  const network = await provider.getNetwork();
  assert(network.chainId === 1874n, "RPC is not Whitechain Sepolia (1874).");
  const sender = new Wallet(required("LIVE_SENDER_PRIVATE_KEY"), provider);
  const relayer = new Wallet(required("RELAYER_PRIVATE_KEY"), provider);
  const vaultAddress = process.env.VAULT_ADDRESS || "";
  const relayerGas = await provider.getBalance(relayer.address);
  const senderUsdt: bigint = await token.balanceOf(sender.address);
  check(
    relayerGas > 0n,
    `Relayer ${relayer.address} has no WBT. Fund it from https://faucet.testnet.whitechain.io`,
  );
  check(
    senderUsdt >= amount,
    `Live sender ${sender.address} needs at least 1 official test USDT (has ${senderUsdt}). Request it from the Whitechain team.`,
  );
  if (!vaultAddress)
    problems.push("VAULT_ADDRESS is empty. Run `pnpm contracts:deploy -- --confirm-testnet`.");
  else {
    const vault = new Contract(vaultAddress, vaultAbi, provider);
    const code = await provider.getCode(vaultAddress);
    check(code !== "0x", `No contract at VAULT_ADDRESS ${vaultAddress}.`);
    if (code !== "0x") {
      check(
        (await vault.usdt()).toLowerCase() === USDT_ADDRESS.toLowerCase(),
        "Vault does not use official USDT.",
      );
      check(
        (await vault.relayer()).toLowerCase() === relayer.address.toLowerCase(),
        "Vault relayer differs from RELAYER_PRIVATE_KEY.",
      );
    }
  }
  const status = await fetch(`${app}/api/status`)
    .then((r) => r.json())
    .catch(() => null);
  check(status, `The app is not reachable at ${app}. Start \`pnpm dev\`.`);
  console.log(
    JSON.stringify(
      {
        chainId: 1874,
        relayer: relayer.address,
        relayerWbt: formatEther(relayerGas),
        sender: sender.address,
        senderUsdt: String(senderUsdt),
        vault: vaultAddress || null,
      },
      null,
      2,
    ),
  );
  if (problems.length) {
    problems.forEach((p) => console.error(`✗ ${p}`));
    throw new Error("Preflight failed.");
  }
  console.log("✓ Preflight passed.");
  if (preflightOnly) process.exit(0);

  const vault = new Contract(vaultAddress, vaultAbi, provider);
  const senderGasBefore = await provider.getBalance(sender.address);
  await call("session", {});
  const challenge = await call<{ challengeId: string; message: string }>("auth/sender/options", {
    address: sender.address,
  });
  await call("auth/sender/verify", {
    challengeId: challenge.challengeId,
    signature: await sender.signMessage(challenge.message),
  });
  const config = await call<{ vault: string }>("gift-config");
  assert(
    config.vault.toLowerCase() === vaultAddress.toLowerCase(),
    "App and script use different vaults.",
  );
  const now = Math.floor(Date.now() / 1000);
  const terms: GiftTerms = {
    from: sender.address.toLowerCase(),
    amount: String(amount),
    expiry: now + (refund ? 120 : 86_400),
    secretHash: keccak256(hexlify(randomBytes(32))),
    boundHuman: ZeroHash,
    campaignId: ZeroHash,
    salt: hexlify(randomBytes(32)),
  };
  const nonce = giftNonce(config.vault, terms);
  const validBefore = now + 300;
  const signature = await sender.signTypedData(TOKEN_DOMAIN, authorizationTypes, {
    from: terms.from,
    to: config.vault,
    value: terms.amount,
    validAfter: 0,
    validBefore,
    nonce,
  });
  const created = await call<GiftView>("gifts", {
    terms,
    validAfter: 0,
    validBefore,
    signature,
    label: "Live testnet check",
  });
  console.log(`Gift queued: ${created.id}`);
  const sent = await waitFor(created.id, "sent", 180);
  assert(sent.createdTx, "No creation transaction recorded.");
  const receipt = await provider.getTransactionReceipt(sent.createdTx);
  const tx = await provider.getTransaction(sent.createdTx);
  assert(receipt?.status === 1, "Creation transaction did not succeed.");
  assert(
    tx?.from.toLowerCase() === relayer.address.toLowerCase(),
    "The relayer did not pay for creation.",
  );
  assert(tx?.to?.toLowerCase() === vaultAddress.toLowerCase(), "Creation did not call the vault.");
  const onchain = await vault.gifts(created.id);
  assert(Number(onchain.state) === 1 && onchain.amount === amount, "Vault does not hold the gift.");
  assert(onchain.sender.toLowerCase() === terms.from, "Vault records the wrong sender.");
  assert(
    (await provider.getBalance(sender.address)) === senderGasBefore,
    "The sender spent WBT gas.",
  );
  assert(
    (await token.balanceOf(sender.address)) === senderUsdt - amount,
    "Sender USDT did not move into the vault.",
  );
  console.log(`✓ Real gasless gift on Whitechain: ${explorerTx(sent.createdTx)}`);

  if (refund) {
    const returned = await waitFor(created.id, "returned", 300);
    assert(returned.refundTx, "No return transaction recorded.");
    assert(
      (await provider.getTransactionReceipt(returned.refundTx))?.status === 1,
      "Return did not succeed.",
    );
    assert(
      Number((await vault.gifts(created.id)).state) === 4,
      "Vault does not show the gift returned.",
    );
    assert(
      (await token.balanceOf(sender.address)) === senderUsdt,
      "Sender USDT was not fully returned.",
    );
    console.log(`✓ Unclaimed gift returned in full: ${explorerTx(returned.refundTx)}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Live check failed.");
  process.exitCode = 1;
} finally {
  provider.destroy();
}
