import type { Eip1193Provider } from "ethers";

function unauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; error?: unknown; data?: { originalError?: unknown } };
  return (
    value.code === 4100 || unauthorized(value.error) || unauthorized(value.data?.originalError)
  );
}

/** Retry authorization once; the callback must create a fresh account-bound challenge. */
export async function withWalletAuthorization<T>(
  provider: Eip1193Provider,
  signIn: () => Promise<T>,
): Promise<T> {
  try {
    return await signIn();
  } catch (error) {
    if (!unauthorized(error)) throw error;
  }
  try {
    await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    await provider.request({ method: "eth_requestAccounts" });
    return await signIn();
  } catch (error) {
    if (!unauthorized(error)) throw error;
    throw new Error(
      "MetaMask has not authorized this account. Open MetaMask, connect your selected account to this site, then try signing in again.",
    );
  }
}
