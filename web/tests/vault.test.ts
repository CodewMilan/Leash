import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import ganache from "ganache";
import {
  BrowserProvider,
  Contract,
  ContractFactory,
  Wallet,
  ZeroHash,
  hexlify,
  keccak256,
  randomBytes,
  type JsonRpcSigner,
  type BaseContract,
} from "ethers";
import { readFileSync } from "node:fs";
import { compileContracts } from "../scripts/compile-contracts.mjs";
import { authorizationTypes, claimTypes, giftNonce, type GiftTerms } from "../src/lib/chain";

describe("ShagunVault value-moving rules", () => {
  const rpc = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 1874, hardfork: "shanghai" },
    wallet: { totalAccounts: 4 },
  });
  // Identical calls (e.g. a rejected and a later valid closeClaimed) must not share a cached result.
  const provider = new BrowserProvider(rpc, undefined, { cacheTimeout: -1 });
  const sender = Wallet.createRandom(),
    attester = Wallet.createRandom();
  let relayer: JsonRpcSigner, outsider: JsonRpcSigner;
  let vault: Contract, token: Contract, vaultAddress: string, treasury: string;
  let snapshot: string;
  const random = () => hexlify(randomBytes(32));
  const deployed = (c: BaseContract) => c as Contract;
  beforeAll(async () => {
    const built = compileContracts({
      "MockUSDT.sol": { content: readFileSync("../contracts/test/MockUSDT.sol", "utf8") },
    });
    relayer = await provider.getSigner(0);
    outsider = await provider.getSigner(1);
    treasury = await (await provider.getSigner(2)).getAddress();
    const t = built.contracts["MockUSDT.sol"].MockUSDT,
      v = built.contracts["ShagunVault.sol"].ShagunVault;
    token = deployed(await new ContractFactory(t.abi, t.evm.bytecode.object, relayer).deploy());
    await token.waitForDeployment();
    vault = deployed(
      await new ContractFactory(v.abi, v.evm.bytecode.object, relayer).deploy(
        await token.getAddress(),
        await relayer.getAddress(),
        attester.address,
        await relayer.getAddress(),
        treasury,
        await relayer.getAddress(),
      ),
    );
    await vault.waitForDeployment();
    vaultAddress = await vault.getAddress();
    await (await token.mint(sender.address, 1_000_000_000n)).wait();
    snapshot = (await rpc.request({ method: "evm_snapshot", params: [] })) as string;
  });
  beforeEach(async () => {
    await rpc.request({ method: "evm_revert", params: [snapshot] });
    snapshot = (await rpc.request({ method: "evm_snapshot", params: [] })) as string;
  });
  afterAll(async () => {
    provider.destroy();
    await rpc.disconnect();
  });
  async function prepare(campaignId = ZeroHash, boundHuman = ZeroHash) {
    const block = await provider.getBlock("latest");
    const secret = random();
    const terms: GiftTerms = {
      from: sender.address,
      amount: "25000000",
      expiry: block!.timestamp + 3600,
      secretHash: keccak256(secret),
      boundHuman,
      campaignId,
      salt: random(),
    };
    const nonce = giftNonce(vaultAddress, terms);
    const validBefore = block!.timestamp + 1800;
    const signature = await sender.signTypedData(
      {
        name: "Tether USD",
        version: "1",
        chainId: 1874,
        verifyingContract: await token.getAddress(),
      },
      authorizationTypes,
      {
        from: sender.address,
        to: vaultAddress,
        value: terms.amount,
        validAfter: 0,
        validBefore,
        nonce,
      },
    );
    return { terms, secret, nonce, validBefore, signature };
  }
  async function create(campaignId = ZeroHash, boundHuman = ZeroHash) {
    const p = await prepare(campaignId, boundHuman);
    await (await vault.createGiftWithAuthorization(p.terms, 0, p.validBefore, p.signature)).wait();
    return p;
  }
  async function claim(
    p: Awaited<ReturnType<typeof prepare>>,
    human = random(),
    overrides: { secret?: string; signer?: Pick<Wallet, "signTypedData"> } = {},
  ) {
    const block = await provider.getBlock("latest");
    const attestation = {
      giftId: p.nonce,
      human,
      session: random(),
      nonce: random(),
      deadline: block!.timestamp + 600,
    };
    const signature = await (overrides.signer || attester).signTypedData(
      { name: "ShagunVault", version: "1", chainId: 1874, verifyingContract: vaultAddress },
      claimTypes,
      attestation,
    );
    return vault.claim(
      p.nonce,
      overrides.secret || p.secret,
      human,
      attestation.session,
      attestation.nonce,
      attestation.deadline,
      signature,
    );
  }
  it("creates an authorized gift while the sender has zero native gas tokens", async () => {
    expect(await provider.getBalance(sender.address)).toBe(0n);
    const p = await create();
    expect(await token.balanceOf(vaultAddress)).toBe(25_000_000n);
    expect((await vault.gifts(p.nonce)).state).toBe(1n);
    expect(await provider.getBalance(sender.address)).toBe(0n);
    expect(await vault.authorizationNonce(p.terms)).toBe(p.nonce);
  });
  it("rejects altered expiry, secret, campaign, bound identity, amount and salt", async () => {
    const p = await prepare();
    const mutations = [
      { expiry: p.terms.expiry + 1 },
      { secretHash: random() },
      { campaignId: random() },
      { boundHuman: random() },
      { amount: "26000000" },
      { salt: random() },
    ];
    for (const mutation of mutations)
      await expect(
        vault.createGiftWithAuthorization(
          { ...p.terms, ...mutation },
          0,
          p.validBefore,
          p.signature,
        ),
      ).rejects.toThrow();
    expect(await token.balanceOf(vaultAddress)).toBe(0n);
  });
  it("rejects authorization replay and non-relayer creation", async () => {
    const p = await create();
    await expect(
      (async () => {
        const tx = await vault.createGiftWithAuthorization(p.terms, 0, p.validBefore, p.signature);
        await tx.wait();
      })(),
    ).rejects.toThrow();
    const next = await prepare();
    await expect(
      vault.connect(outsider).getFunction("createGiftWithAuthorization")(
        next.terms,
        0,
        next.validBefore,
        next.signature,
      ),
    ).rejects.toThrow();
  });
  it("rejects wrong secrets, wrong attestations and unauthorized claim callers", async () => {
    const p = await create();
    await expect(claim(p, random(), { secret: random() })).rejects.toThrow();
    await expect(claim(p, random(), { signer: Wallet.createRandom() })).rejects.toThrow();
    await expect(
      vault.connect(outsider).getFunction("claim")(
        p.nonce,
        p.secret,
        random(),
        random(),
        random(),
        p.terms.expiry,
        "0x",
      ),
    ).rejects.toThrow();
    expect((await vault.gifts(p.nonce)).state).toBe(1n);
  });
  it("allows only one campaign gift per recipient commitment while ordinary gifts remain repeatable", async () => {
    const campaign = random(),
      human = random();
    const a = await create(campaign),
      b = await create(campaign),
      ordinary = await create();
    await (await claim(a, human)).wait();
    await expect(claim(b, human)).rejects.toThrow();
    await (await claim(ordinary, human)).wait();
    expect((await vault.gifts(b.nonce)).state).toBe(1n);
  });
  it("settles once to treasury and rejects duplicate claims, settlement and claimed refunds", async () => {
    const p = await create();
    await (await claim(p)).wait();
    await expect(claim(p)).rejects.toThrow();
    await expect(
      vault.connect(outsider).getFunction("cashOut")(p.nonce, random()),
    ).rejects.toThrow();
    await (await vault.cashOut(p.nonce, random())).wait();
    expect(await token.balanceOf(treasury)).toBe(25_000_000n);
    await expect(vault.cashOut(p.nonce, random())).rejects.toThrow();
    await rpc.request({ method: "evm_increaseTime", params: [3601] });
    await rpc.request({ method: "evm_mine", params: [] });
    await expect(vault.refundExpired(p.nonce)).rejects.toThrow();
  });
  it("settles partial card spending once per reference and never beyond the gift", async () => {
    const p = await create();
    await expect(vault.spend(p.nonce, 8_000_000n, random())).rejects.toThrow();
    await (await claim(p)).wait();
    const ref = random();
    await expect(
      vault.connect(outsider).getFunction("spend")(p.nonce, 8_000_000n, ref),
    ).rejects.toThrow();
    await (await vault.spend(p.nonce, 8_000_000n, ref)).wait();
    await expect(vault.spend(p.nonce, 1_000_000n, ref)).rejects.toThrow();
    await expect(vault.spend(p.nonce, 17_000_001n, random())).rejects.toThrow();
    await expect(vault.cashOut(p.nonce, random())).rejects.toThrow();
    const gift = await vault.gifts(p.nonce);
    expect(gift.spent).toBe(8_000_000n);
    expect(gift.state).toBe(2n);
    expect(await token.balanceOf(treasury)).toBe(8_000_000n);
  });
  it("returns only the unspent balance after expiry and stops spending once closed", async () => {
    const p = await create();
    await (await claim(p)).wait();
    await (await vault.spend(p.nonce, 8_000_000n, random())).wait();
    await expect(vault.closeClaimed(p.nonce)).rejects.toThrow();
    await rpc.request({ method: "evm_increaseTime", params: [3601] });
    await rpc.request({ method: "evm_mine", params: [] });
    await (await vault.spend(p.nonce, 2_000_000n, random())).wait();
    await expect(vault.refundExpired(p.nonce)).rejects.toThrow();
    await expect(
      vault.connect(outsider).getFunction("closeClaimed")(p.nonce),
    ).rejects.toThrow();
    await (await vault.closeClaimed(p.nonce)).wait();
    expect(await token.balanceOf(sender.address)).toBe(990_000_000n);
    expect(await token.balanceOf(treasury)).toBe(10_000_000n);
    expect(await token.balanceOf(vaultAddress)).toBe(0n);
    expect((await vault.gifts(p.nonce)).state).toBe(4n);
    await expect(vault.spend(p.nonce, 1_000_000n, random())).rejects.toThrow();
    await expect(vault.closeClaimed(p.nonce)).rejects.toThrow();
  });
  it("lets anyone return a claimed gift's balance after the close grace period", async () => {
    const p = await create();
    await (await claim(p)).wait();
    await rpc.request({ method: "evm_increaseTime", params: [3601 + 7 * 86_400] });
    await rpc.request({ method: "evm_mine", params: [] });
    await (await vault.connect(outsider).getFunction("closeClaimed")(p.nonce)).wait();
    expect(await token.balanceOf(sender.address)).toBe(1_000_000_000n);
  });
  it("settles a fully spent gift with nothing left to return", async () => {
    const p = await create();
    await (await claim(p)).wait();
    await (await vault.spend(p.nonce, 25_000_000n, random())).wait();
    expect((await vault.gifts(p.nonce)).state).toBe(3n);
    await rpc.request({ method: "evm_increaseTime", params: [3601] });
    await rpc.request({ method: "evm_mine", params: [] });
    await expect(vault.closeClaimed(p.nonce)).rejects.toThrow();
    expect(await token.balanceOf(treasury)).toBe(25_000_000n);
  });
  it("rejects a different bound human", async () => {
    const human = random(),
      p = await create(ZeroHash, human);
    await expect(claim(p, random())).rejects.toThrow();
    await (await claim(p, human)).wait();
  });
  it("allows only the admin to rotate roles and pause, while keeping expiry refunds available", async () => {
    const p = await create();
    await expect(vault.connect(outsider).getFunction("pause")()).rejects.toThrow();
    await expect(
      vault.connect(outsider).getFunction("setRoles")(
        await outsider.getAddress(),
        attester.address,
        treasury,
      ),
    ).rejects.toThrow();
    await (await vault.pause()).wait();
    const next = await prepare();
    await expect(
      vault.createGiftWithAuthorization(next.terms, 0, next.validBefore, next.signature),
    ).rejects.toThrow();
    await expect(claim(p)).rejects.toThrow();
    await rpc.request({ method: "evm_increaseTime", params: [3601] });
    await rpc.request({ method: "evm_mine", params: [] });
    await (await vault.connect(outsider).getFunction("refundExpired")(p.nonce)).wait();
    expect((await vault.gifts(p.nonce)).state).toBe(4n);
    await (
      await vault.setRoles(
        await outsider.getAddress(),
        attester.address,
        await relayer.getAddress(),
      )
    ).wait();
    expect(await vault.relayer()).toBe(await outsider.getAddress());
  });
  it("makes claim and refund mutually exclusive at expiry and returns the exact amount", async () => {
    const p = await create();
    await expect(vault.refundExpired(p.nonce)).rejects.toThrow();
    await rpc.request({ method: "evm_setTime", params: [p.terms.expiry * 1000] });
    await rpc.request({ method: "evm_mine", params: [] });
    await expect(claim(p)).rejects.toThrow();
    await (await vault.connect(outsider).getFunction("refundExpired")(p.nonce)).wait();
    expect(await token.balanceOf(sender.address)).toBe(1_000_000_000n);
    expect(await token.balanceOf(vaultAddress)).toBe(0n);
    await expect(vault.refundExpired(p.nonce)).rejects.toThrow();
  });
});
