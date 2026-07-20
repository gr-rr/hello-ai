export function audioExtFromName(name: string): string {
  const ext = name.split(".").pop() || "wav";
  return ext.toLowerCase();
}

export function audioFmtFromName(name: string): string {
  const ext = audioExtFromName(name);
  if (["ogg", "mp4", "m4a", "flac", "mp3", "wav", "webm"].includes(ext)) {
    return ext === "m4a" ? "mp4" : ext;
  }
  return "wav";
}

export function audioFmtFromBlob(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mp4") || type.includes("m4a")) return "mp4";
  if (type.includes("flac")) return "flac";
  if (type.includes("mp3") || type.includes("mpeg")) return "mp3";
  return "wav";
}
