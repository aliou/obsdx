import { cancel, isCancel } from "@clack/prompts";

export function assertNotCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Cancelled");
    process.exit(0);
  }

  return value;
}
