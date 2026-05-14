import { discoverVault } from "../vault/discover";
import { getGlobalOptions } from "./main";

export async function resolveVaultFromOptions() {
  const options = getGlobalOptions();
  return discoverVault(options.vault);
}
