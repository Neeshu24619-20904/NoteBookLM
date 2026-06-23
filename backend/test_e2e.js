import fs from "fs";
import path from "path";
import { ingestDocument } from "./ingest.js";
import { queryDocument } from "./query.js";

async function run() {
  console.log("=== PHASE 1: INGESTION ===");
  // Create a temporary text file to simulate upload
  const testFile = path.join("data", "uploads", "test_e2e.txt");
  fs.writeFileSync(testFile, "NutriSnap is a revolutionary application that uses artificial intelligence to analyze meals and calculate nutritional information automatically from photos. It was launched in 2024 and has over a million users.");
  
  const ingestResult = await ingestDocument(testFile, "text/plain", "test_e2e.txt");
  const docId = ingestResult.documentId;
  console.log(`Ingested successfully. docId=${docId}`);

  console.log("\n=== PHASE 2: DEBUG ENDPOINT VERIFICATION ===");
  // We will just directly read the index and metadata to mimic the debug endpoint
  const indexPath = path.join("data", "indexes", `${docId}.index`);
  const metaPath = path.join("data", "metadata", `${docId}.json`);
  console.log(`Index exists: ${fs.existsSync(indexPath)}`);
  console.log(`Meta exists: ${fs.existsSync(metaPath)}`);

  console.log("\n=== PHASE 3: QUERY VERIFICATION ===");
  const question = "Summarize this document.";
  try {
    const result = await queryDocument(question, docId);
    console.log("\n=== FINAL RESULT ===");
    console.log(result.answer);
  } catch (err) {
    console.error("Query failed:", err);
  }
}

run();
