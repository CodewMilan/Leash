import { Contract, JsonRpcProvider, TypedDataEncoder } from "ethers";
import { TOKEN_DOMAIN, USDT_ADDRESS } from "../src/lib/chain";
import { rpcUrl } from "../src/lib/server/config";

const provider = new JsonRpcProvider(rpcUrl());
try {
  const network = await provider.getNetwork();
  if (network.chainId !== 1874n) throw new Error("Wrong chain; expected 1874.");
  const token = new Contract(
    USDT_ADDRESS,
    [
      "function decimals() view returns(uint8)",
      "function name() view returns(string)",
      "function DOMAIN_SEPARATOR() view returns(bytes32)",
    ],
    provider,
  );
  if ((await provider.getCode(USDT_ADDRESS)) === "0x")
    throw new Error("Official token is missing.");
  if (
    (await token.decimals()) !== 6n ||
    (await token.name()) !== TOKEN_DOMAIN.name ||
    (await token.DOMAIN_SEPARATOR()) !== TypedDataEncoder.hashDomain(TOKEN_DOMAIN)
  )
    throw new Error("Token domain or decimals did not match.");
  console.log(
    JSON.stringify({
      chainId: Number(network.chainId),
      token: USDT_ADDRESS,
      decimals: 6,
      domainMatches: true,
    }),
  );
} catch {
  console.error(
    "Chain check failed. Verify RPC connectivity, chain 1874, and the official USDT domain.",
  );
  process.exitCode = 1;
} finally {
  provider.destroy();
}
