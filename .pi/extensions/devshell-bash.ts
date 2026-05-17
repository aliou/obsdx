import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  BashSpawnContext,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const BASH_SPAWN_HOOK_REQUEST_EVENT = "ad:bash:spawn-hook:request";
const CONTRIBUTOR_ID = "obsdx-devshell";
const CONTRIBUTOR_PRIORITY = 10;

type SpawnHookContributor = {
  id: string;
  priority?: number;
  spawnHook: (ctx: BashSpawnContext) => BashSpawnContext;
};

type SpawnHookRequestPayload = {
  register: (contributor: SpawnHookContributor) => void;
};

function isSpawnHookRequestPayload(
  value: unknown,
): value is SpawnHookRequestPayload {
  if (!value || typeof value !== "object") return false;
  return (
    typeof (value as Partial<SpawnHookRequestPayload>).register === "function"
  );
}

function findFlakeRoot(start: string): string | null {
  let current = start;

  while (true) {
    if (existsSync(join(current, "flake.nix"))) return current;

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function shouldWrap(env: NodeJS.ProcessEnv): boolean {
  return env.PI_NIX_DEVSHELL_WRAPPED !== "1" && !env.IN_NIX_SHELL;
}

function wrapInDevShell(command: string, flakeRoot: string): string {
  return `nix develop ${shellQuote(flakeRoot)} -c bash -lc ${shellQuote(command)}`;
}

export default function (pi: ExtensionAPI) {
  const flakeRoot = findFlakeRoot(process.cwd());
  if (!flakeRoot) return;

  const contributor: SpawnHookContributor = {
    id: CONTRIBUTOR_ID,
    priority: CONTRIBUTOR_PRIORITY,
    spawnHook(ctx) {
      const env = { ...ctx.env, PI_NIX_DEVSHELL_WRAPPED: "1" };

      if (!shouldWrap(ctx.env)) {
        return { ...ctx, env };
      }

      return {
        ...ctx,
        command: wrapInDevShell(ctx.command, flakeRoot),
        env,
      };
    },
  };

  pi.events.on(BASH_SPAWN_HOOK_REQUEST_EVENT, (data: unknown) => {
    if (!isSpawnHookRequestPayload(data)) return;
    data.register(contributor);
  });
}
