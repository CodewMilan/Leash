import { BrowserProvider, Contract, getAddress, type Eip1193Provider } from "ethers";
import { CHAIN_HEX, CHAIN_ID, ERC20_ABI, PRICE_UNITS, USDC_ADDRESS } from "./model";
export type InjectedWallet = Eip1193Provider & { on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void };
export function injectedWallet(): InjectedWallet {
  const wallet = (window as unknown as { ethereum?: InjectedWallet }).ethereum;
  if (!wallet) throw new Error("No browser wallet found. Open this app in an EVM wallet browser or a browser with your wallet extension installed.");
  return wallet;
}
export async function connectBrowserWallet() {
  const provider = new BrowserProvider(injectedWallet());
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { address: await signer.getAddress(), signer };
}
export async function payTestUsdc(buyer: string, treasury: string) {
  const wallet = injectedWallet();
  try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
  catch (error) {
    if ((error as {code?:number}).code !== 4902) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN_HEX, chainName: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia.base.org"], blockExplorerUrls: ["https://sepolia.basescan.org"] }] });
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  }
  const provider = new BrowserProvider(wallet);
  const signer = await provider.getSigner();
  if (getAddress(await signer.getAddress()) !== getAddress(buyer)) throw new Error("Your selected wallet changed. Disconnect and sign in with the order’s buyer wallet.");
  if ((await provider.getNetwork()).chainId !== BigInt(CHAIN_ID)) throw new Error("Switch your wallet to Base Sepolia before paying.");
  if (getAddress(treasury) === getAddress(buyer)) throw new Error("Use a buyer wallet different from the testnet receiving treasury.");
  const usdc = new Contract(USDC_ADDRESS, ERC20_ABI, signer);
  if (await usdc.balanceOf(buyer) < BigInt(PRICE_UNITS)) throw new Error("You need 100 test USDC on Base Sepolia. Use the test-USDC faucet first.");
  if (await provider.getBalance(buyer) === BigInt(0)) throw new Error("You need Base Sepolia ETH for network fees. Use a testnet ETH faucet first.");
  // ERC-20 transfer only: no unlimited approvals, permits or mainnet options.
  const tx = await usdc.transfer(treasury, BigInt(PRICE_UNITS));
  return String(tx.hash);
}
export function walletError(error: unknown) {
  const candidate = error as { code?: string | number; shortMessage?: string; message?: string };
  if (candidate?.code === 4001 || candidate?.code === "ACTION_REJECTED") return "Request cancelled in your wallet. No new payment was confirmed by the app.";
  if (candidate?.code === "INSUFFICIENT_FUNDS") return "Insufficient Base Sepolia ETH for transaction fees. Add test ETH and retry.";
  return candidate?.shortMessage || candidate?.message || "Wallet request failed. Check your wallet and try again.";
}
