import solc from "solc";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function compileContracts(extraSources = {}) {
  const input = {
    language: "Solidity",
    sources: {
      "ShagunVault.sol": {
        content: readFileSync(resolve(webRoot, "../contracts/ShagunVault.sol"), "utf8"),
      },
      ...extraSources,
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "metadata"] } },
    },
  };
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), {
      import: (path) => {
        if (!path.startsWith("@openzeppelin/contracts/"))
          return { error: "Import is not allowlisted." };
        try {
          return { contents: readFileSync(resolve(webRoot, "node_modules", path), "utf8") };
        } catch {
          return { error: `Missing dependency: ${path}` };
        }
      },
    }),
  );
  const errors = (output.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  return { contracts: output.contracts, input, compiler: solc.version() };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = compileContracts();
  const out = resolve(webRoot, "../contracts/artifacts");
  mkdirSync(out, { recursive: true });
  const vault = result.contracts["ShagunVault.sol"].ShagunVault;
  writeFileSync(
    resolve(out, "ShagunVault.json"),
    JSON.stringify(
      { abi: vault.abi, bytecode: vault.evm.bytecode.object, compiler: result.compiler },
      null,
      2,
    ),
  );
  writeFileSync(resolve(out, "compiler-input.json"), JSON.stringify(result.input, null, 2));
  console.log(`ShagunVault compiled (${result.compiler}). Standard JSON verification input saved.`);
}
