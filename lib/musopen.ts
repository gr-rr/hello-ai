export type MusopenWork = {
  id: string;
  title: string;
  composer: string;
  century: string;
  epoch: string;
  recordings: {
    id: string;
    url: string;
    duration: number;
    format: string;
  }[];
};

type ArchiveSearchResult = {
  response: {
    numFound: number;
    docs: {
      identifier: string;
      title: string;
      creator: string | string[];
    }[];
  };
};

type ArchiveFile = {
  name: string;
  format: string;
  size: string;
  length?: string;
};

type ArchiveMetadata = {
  metadata: {
    identifier: string;
    title: string;
    creator: string | string[];
  };
  result: ArchiveFile[];
};

const ARCHIVE_SEARCH = "https://archive.org/advancedsearch.php";

export type FetchWorksResult = {
  works: MusopenWork[];
  error?: string;
};

const MUSIC_BASE = "mediatype:audio AND format:(MP3 OR FLAC OR Ogg Vorbis)";

export async function fetchWorks(limit = 30): Promise<FetchWorksResult> {
  return searchWorks("classical piano orchestral", limit);
}

export async function searchWorks(query: string, limit = 20): Promise<FetchWorksResult> {
  try {
    const q = query.trim()
      ? `${MUSIC_BASE} AND (${query.trim()})`
      : `${MUSIC_BASE} AND (classical OR piano OR orchestral OR symphony OR sonata)`;
    const params = new URLSearchParams({
      q,
      fl: "identifier,title,creator",
      rows: String(limit),
      output: "json",
      sort: "downloads desc",
    });
    const res = await fetch(`${ARCHIVE_SEARCH}?${params}`);
    if (!res.ok) {
      return {
        works: [],
        error: `Internet Archive API unavailable (${res.status}). Browse https://archive.org/audio instead.`,
      };
    }
    const json: ArchiveSearchResult = await res.json();
    const docs = json?.response?.docs ?? [];
    if (docs.length === 0) return { works: [] };

    const works = await Promise.all(docs.map(normalizeSearchResult));
    return { works };
  } catch (err) {
    return {
      works: [],
      error: `Internet Archive unreachable. ${err instanceof Error ? err.message : ""}`.trim(),
    };
  }
}

async function normalizeSearchResult(doc: ArchiveSearchResult["response"]["docs"][0]): Promise<MusopenWork> {
  const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator ?? "Unknown";
  const files = await fetchItemFiles(doc.identifier);
  return {
    id: doc.identifier,
    title: doc.title || doc.identifier,
    composer: creator,
    century: "",
    epoch: "",
    recordings: files,
  };
}

async function fetchItemFiles(identifier: string): Promise<MusopenWork["recordings"]> {
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}/files`);
    if (!res.ok) return [];
    const json = await res.json();
    const files: ArchiveFile[] = json?.result ?? [];
    return files
      .filter((f) => isAudioFormat(f.format) && !f.name.includes("_spectrogram"))
      .slice(0, 3)
      .map((f) => ({
        id: `${identifier}/${f.name}`,
        url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
        duration: f.length ? parseFloat(f.length) : 0,
        format: extFromFormat(f.format),
      }));
  } catch {
    return [];
  }
}

function isAudioFormat(format: string): boolean {
  const lower = format.toLowerCase();
  return lower.includes("mp3") || lower.includes("flac") || lower.includes("ogg") || lower.includes("vorbis");
}

function extFromFormat(format: string): string {
  const lower = format.toLowerCase();
  if (lower.includes("flac")) return "flac";
  if (lower.includes("ogg") || lower.includes("vorbis")) return "ogg";
  return "mp3";
}

export function fetchFirstRecording(work: MusopenWork): MusopenWork["recordings"][number] | null {
  return work.recordings.length > 0 ? work.recordings[0] : null;
}
