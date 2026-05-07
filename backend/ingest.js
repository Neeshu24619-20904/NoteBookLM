import { QdrantClient } from "@qdrant/js-client-rest";
import pdfParse from "pdf-parse";
import fs from "fs";
import { embedText, VECTOR_SIZE } from "./embeddings.js";
import "dotenv/config";

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

/**
 * CHUNKING STRATEGY: Fixed-size with overlap
 * - chunkSize: 800 characters per chunk
 * - overlap: 150 characters between consecutive chunks
 * This ensures context continuity across chunk boundaries.
 */
function chunkText(text, chunkSize = 800, overlap = 150) {
  // Clean whitespace
  const cleaned = text.replace(/\s+/g, " ").trim();
  const chunks = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function ingestDocument(filePath, mimeType) {
  let text = "";

  // Parse document
  if (mimeType === "application/pdf") {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } else {
    // Plain text
    text = fs.readFileSync(filePath, "utf-8");
  }

  if (!text || text.trim().length < 50) {
    throw new Error("Document appears to be empty or unreadable.");
  }

  // Chunk the text
  const chunks = chunkText(text);
  console.log(`Document chunked into ${chunks.length} pieces`);

  // Create a unique collection name per document
  const collectionName = `doc_${Date.now()}`;

  // Create Qdrant collection
  await qdrant.recreateCollection(collectionName, {
    vectors: { size: VECTOR_SIZE, distance: "Cosine" },
  });

  // Embed each chunk and upsert into Qdrant
  const points = [];
  for (let i = 0; i < chunks.length; i++) {
    const vector = await embedText(chunks[i]);
    points.push({
      id: i,
      vector,
      payload: {
        text: chunks[i],
        chunkIndex: i,
        totalChunks: chunks.length,
      },
    });

    // Batch upsert every 50 chunks
    if (points.length === 50 || i === chunks.length - 1) {
      await qdrant.upsert(collectionName, { points: [...points] });
      points.length = 0;
    }
  }

  console.log(`Ingestion complete. Collection: ${collectionName}`);
  return { collectionName, chunkCount: chunks.length };
}
