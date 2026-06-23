import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import faiss from "faiss-node";
import { embedBatch, VECTOR_SIZE } from "./embeddings.js";

function chunkText(text, chunkSize = 1000, overlap = 200) {
  const separators = ["\n\n", "\n", ". ", " "];
  
  function splitText(textToSplit, separatorIndex = 0) {
    if (textToSplit.length <= chunkSize) return [textToSplit];
    
    const separator = separatorIndex < separators.length ? separators[separatorIndex] : "";
    let splits = separator !== "" ? textToSplit.split(separator) : textToSplit.split("");
    
    const chunks = [];
    let currentChunk = "";
    
    for (const split of splits) {
      if (!currentChunk) {
        currentChunk = split;
      } else {
        const addition = separator + split;
        if (currentChunk.length + addition.length <= chunkSize) {
          currentChunk += addition;
        } else {
          chunks.push(currentChunk);
          let overlapStr = currentChunk.slice(-overlap);
          let spaceIndex = overlapStr.indexOf(" ");
          if (spaceIndex !== -1) overlapStr = overlapStr.slice(spaceIndex + 1);
          currentChunk = overlapStr + addition;
        }
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    
    const finalChunks = [];
    for (const chunk of chunks) {
      if (chunk.length > chunkSize && separatorIndex < separators.length) {
        finalChunks.push(...splitText(chunk, separatorIndex + 1));
      } else {
        finalChunks.push(chunk);
      }
    }
    return finalChunks;
  }
  
  return splitText(text).map(c => c.trim()).filter(c => c.length > 0);
}

export async function ingestDocument(filePath, mimeType, originalName = "unknown") {
  let text = "";

  if (mimeType === "application/pdf") {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } catch (e) {
      throw new Error(`Corrupted PDF or extraction failed: ${e.message}`);
    }
  } else {
    text = fs.readFileSync(filePath, "utf-8");
  }

  if (!text || text.trim().length < 50) {
    throw new Error("Document appears to be empty or unreadable.");
  }

  const chunks = chunkText(text);
  console.log(`Document chunked into ${chunks.length} pieces`);

  const documentId = uuidv4();
  
  // Inner Product works well for cosine similarity since vectors are normalized
  const index = new faiss.IndexFlatIP(VECTOR_SIZE);
  const metadata = [];

  const batchSize = 32;
  let embeddingIdCounter = 0;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchChunks = chunks.slice(i, i + batchSize);
    const vectors = await embedBatch(batchChunks);
    
    const flatVectors = vectors.flat();
    index.add(flatVectors);

    for (let j = 0; j < batchChunks.length; j++) {
      metadata.push({
        embeddingId: embeddingIdCounter++,
        text: batchChunks[j],
        index: i + j,
        sourceFilename: originalName,
        documentId: documentId
      });
    }
  }

  const indexPath = path.join("data", "indexes", `${documentId}.index`);
  const metaPath = path.join("data", "metadata", `${documentId}.json`);

  index.write(indexPath);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log(`Ingestion complete. DocumentID: ${documentId}`);
  return { documentId, chunkCount: chunks.length };
}
