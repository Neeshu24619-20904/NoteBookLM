import { pipeline } from "@xenova/transformers";

let embedder = null;

async function getEmbedder() {
  if (!embedder) {
    console.log("Loading embedding model (first time may take ~30s)...");
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    console.log("Embedding model loaded.");
  }
  return embedder;
}

export async function embedText(text) {
  const embed = await getEmbedder();
  const output = await embed(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

// VECTOR SIZE for all-MiniLM-L6-v2 is 384
export const VECTOR_SIZE = 384;
