import faiss from "faiss-node";
import fs from "fs";
import path from "path";
import { embedText } from "./embeddings.js";

async function debug() {
  const indexDir = path.join("data", "indexes");
  const metaDir = path.join("data", "metadata");
  
  const files = fs.readdirSync(indexDir);
  if (files.length === 0) {
    console.log("No indexes found.");
    return;
  }
  
  const docId = files[0].replace(".index", "");
  console.log("Testing with docId:", docId);
  
  const indexPath = path.join(indexDir, `${docId}.index`);
  const metaPath = path.join(metaDir, `${docId}.json`);
  
  const index = faiss.Index.read(indexPath);
  const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  
  console.log(`Index size: ${index.ntotal()}`);
  console.log(`Metadata length: ${metadata.length}`);
  
  const query = "test";
  console.log(`Embedding query: "${query}"`);
  
  const queryVector = await embedText(query);
  console.log(`Query vector length: ${queryVector.length}`);
  
  const k = 5;
  const results = index.search(queryVector, k);
  
  console.log("FAISS Search Results:", results);
}

debug().catch(console.error);
