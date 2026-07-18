export type MusopenWork = {
  id: number;
  title: string;
  composer: string;
  century: string;
  epoch: string;
  recordings: {
    id: number;
    url: string;
    duration: number;
    format: string;
  }[];
};

export type MusopenApiWork = {
  id: number;
  title: string;
  composer_name: string;
  century: string;
  epoch: string;
  instrument: string;
  recordings?: {
    id: number;
    file_url: string;
    file_path: string;
    duration: number;
    format: string;
  }[];
};

const MUSOPEN_API = "https://api.musopen.org/v1/works";

export async function fetchWorks(limit = 30): Promise<MusopenWork[]> {
  const res = await fetch(`${MUSOPEN_API}?limit=${limit}`);
  if (!res.ok) throw new Error(`MusOpen API error: ${res.status}`);
  const json = await res.json();
  const data: MusopenApiWork[] = json?.data ?? json?.works ?? [];
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.map(normalizeWork);
}

function normalizeWork(raw: MusopenApiWork): MusopenWork {
  return {
    id: raw.id,
    title: raw.title,
    composer: raw.composer_name,
    century: raw.century ?? "",
    epoch: raw.epoch ?? "",
    recordings: (raw.recordings ?? []).map((r) => ({
      id: r.id,
      url: r.file_url || `https://api.musopen.org${r.file_path}`,
      duration: r.duration ?? 0,
      format: r.format ?? "mp3",
    })),
  };
}

export function fetchFirstRecording(work: MusopenWork): MusopenWork["recordings"][number] | null {
  return work.recordings.length > 0 ? work.recordings[0] : null;
}
