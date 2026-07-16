import { supabase } from "./supabase";

export type Job = {
  id: string;
  base_model: string;
  params: Record<string, any>;
  dataset_path: string | null;
  status: "queued" | "running" | "done" | "error";
  loss_log: string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type TrainedModel = {
  id: string;
  name: string;
  base_model: string;
  job_id: string | null;
  adapter_path: string;
  created_at: string;
};

export type DatasetRow = {
  instruction: string;
  input?: string;
  output: string;
};

export async function uploadDataset(name: string, jsonl: string): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured");
  const path = `datasets/${Date.now()}-${name.replace(/[^a-z0-9]/gi, "_")}.jsonl`;
  const { error } = await supabase.storage
    .from("datasets")
    .upload(path, jsonl, { contentType: "application/json", upsert: false });
  if (error) throw error;
  return path;
}

export async function listDatasets(): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.storage.from("datasets").list("", {
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error) throw error;
  return (data ?? []).map((f) => f.name);
}

export async function downloadDataset(path: string): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.storage.from("datasets").download(path);
  if (error) throw error;
  return await (data as Blob).text();
}

export async function getModels(): Promise<TrainedModel[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("models")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as TrainedModel[];
}

// A small starter dataset so the flow is verifiable end-to-end.
export const STARTER_DATASET: DatasetRow[] = [
  {
    instruction: "Translate the following to French.",
    input: "Good morning, how are you?",
    output: "Bonjour, comment allez-vous ?",
  },
  {
    instruction: "Write a polite refusal email.",
    input: "A vendor asks for a meeting next Monday.",
    output:
      "Dear [Name],\nThank you for reaching out. Unfortunately I'm unavailable next Monday, but I'd be glad to connect the following week. Best regards.",
  },
  {
    instruction: "Summarize the sentence in one word.",
    input: "The stock market fell sharply after the announcement.",
    output: "Crash.",
  },
  {
    instruction: "Classify the sentiment.",
    input: "I loved this product, it exceeded my expectations!",
    output: "Positive",
  },
  {
    instruction: "Give a short health tip.",
    input: "",
    output:
      "Drink a glass of water first thing in the morning to kick-start hydration.",
  },
  {
    instruction: "Convert Celsius to Fahrenheit in words.",
    input: "25 degrees Celsius",
    output: "25 degrees Celsius is 77 degrees Fahrenheit.",
  },
  {
    instruction: "Write a haiku about the ocean.",
    input: "",
    output:
      "Waves whisper at dusk,\nMoonlight on a silver tide,\nThe sea breathes softly.",
  },
  {
    instruction: "Explain a concept simply.",
    input: "What is a database index?",
    output:
      "A database index is like a book's table of contents: it helps the database find rows quickly without scanning everything.",
  },
];

export function rowsToJsonl(rows: DatasetRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

// Synthetic dataset generation (client-side templates).
// Upgrade path: replace with a small-LLM call.
const SYN_INSTR = [
  "Translate to Spanish.",
  "Write a short apology.",
  "Give a one-line joke.",
  "Summarize in five words.",
  "Classify the topic.",
  "Rewrite formally.",
  "Provide a quick tip.",
  "Explain like I'm five.",
];
const SYN_OUT = [
  "Sure, here is a helpful response.",
  "I appreciate your patience with this matter.",
  "Why did the model cross the prompt? To find the gradient!",
  "Short, clear, and to the point.",
  "This looks like a general knowledge question.",
  "Please accept our sincerest regards.",
  "Try breaking the task into smaller steps.",
  "Think of it as stacking simple building blocks.",
];

export function generateSyntheticDataset(n = 10): DatasetRow[] {
  const rows: DatasetRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      instruction: SYN_INSTR[i % SYN_INSTR.length],
      input: i % 2 === 0 ? `Example input number ${i + 1}.` : "",
      output: SYN_OUT[(i + 3) % SYN_OUT.length],
    });
  }
  return rows;
}
