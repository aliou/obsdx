import { stat } from "node:fs/promises";
import path from "node:path";
import type { ScannedVaultFile, VaultFileKind } from "@aliou/obsdx-index";
import fg from "fast-glob";

export type { ScannedVaultFile, VaultFileKind } from "@aliou/obsdx-index";

export async function scanVaultFiles(
  vaultRoot: string,
): Promise<ScannedVaultFile[]> {
  const relativePaths = await fg("**/*", {
    cwd: vaultRoot,
    dot: false,
    onlyFiles: true,
    unique: true,
    ignore: [".obsidian/**"],
  });

  const files: ScannedVaultFile[] = [];

  for (const relativePath of relativePaths.sort()) {
    const absolutePath = path.join(vaultRoot, relativePath);
    const fileStat = await stat(absolutePath);
    const parsed = path.parse(relativePath);
    const ext = parsed.ext.slice(1).toLowerCase();
    const folder = normalizeFolder(parsed.dir);

    files.push({
      path: relativePath,
      name: parsed.base,
      basename: parsed.name,
      ext,
      folder,
      kind: classifyFile(ext),
      size: fileStat.size,
      ctime: fileStat.ctime.toISOString(),
      mtime: fileStat.mtime.toISOString(),
    });
  }

  return files;
}

export function classifyFile(ext: string): VaultFileKind {
  switch (ext.toLowerCase()) {
    case "md":
      return "markdown";
    case "base":
      return "base";
    case "canvas":
      return "canvas";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
      return "image";
    case "pdf":
      return "pdf";
    case "mp3":
    case "wav":
    case "m4a":
    case "flac":
    case "ogg":
      return "audio";
    case "mp4":
    case "mov":
    case "webm":
    case "mkv":
      return "video";
    case "":
      return "unknown";
    default:
      return "attachment";
  }
}

function normalizeFolder(folder: string): string {
  return folder === "" ? "" : folder.split(path.sep).join("/");
}
