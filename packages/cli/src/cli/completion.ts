import t from "@bomb.sh/tab";

export function handleCompletion(argv: string[]): boolean {
  if (argv[2] !== "complete") {
    return false;
  }

  const shell = argv[3];
  if (shell === "--") {
    t.parse(argv.slice(4));
    return true;
  }

  t.setup("obsdx", "obsdx", shell);
  return true;
}
