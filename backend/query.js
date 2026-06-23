import fs from "fs";
import path from "path";
import Groq from "groq-sdk";
import faiss from "faiss-node";
import { embedText, VECTOR_SIZE } from "./embeddings.js";
import "dotenv/config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function evaluateRelevance(question, chunks) {
  const context = chunks.map((c, i) => `[Chunk ${i + 1}]:\n${c.text}`).join("\n\n");
  const prompt = `You are a strict relevance grader. Evaluate if the provided context chunks are relevant to the question.
Question: ${question}

Context:
${context}

Respond with only "yes" if at least one chunk contains information relevant to answering the question. Respond with only "no" if none of the chunks are relevant.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 10,
    });
    const answer = completion.choices[0].message.content.trim().toLowerCase();
    return answer.includes("yes");
  } catch (e) {
    console.error("Evaluation error:", e.message);
    return true; // Fallback to true if evaluation fails
  }
}

async function reformulateQuestion(question) {
  const prompt = `You are an expert query formulator. The original query failed to retrieve relevant documents. Please rewrite the query to be more descriptive and optimized for vector search retrieval.
Original query: ${question}
Output ONLY the rewritten query text.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 50,
    });
    return completion.choices[0].message.content.trim();
  } catch (e) {
    console.error("Reformulation error:", e.message);
    return question; // Fallback
  }
}

async function rerankChunks(question, chunks) {
  if (chunks.length === 0) return [];
  
  const prompt = `You are an expert relevance ranker. Given a question and a list of chunks, rank the chunks by their relevance to the question.
Question: ${question}

Chunks:
${chunks.map((c, i) => `[Chunk ${i}]: ${c.text}`).join("\n\n")}

Rank the chunks from most relevant to least relevant. Provide the output as a comma-separated list of chunk indices (e.g., 2, 0, 1). Only output the indices, nothing else.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 50,
    });
    
    const rankStr = completion.choices[0].message.content.trim();
    const rankedIndices = rankStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    
    const rerankedChunks = [];
    for (const idx of rankedIndices) {
      if (chunks[idx]) rerankedChunks.push(chunks[idx]);
    }
    
    // Append any missed chunks
    for (const c of chunks) {
      if (!rerankedChunks.includes(c)) rerankedChunks.push(c);
    }
    
    return rerankedChunks;
  } catch (e) {
    console.error("Reranking error:", e.message);
    return chunks; // Fallback to original order
  }
}

async function retrieveChunks(queryVector, index, metadata, topK, similarityThreshold) {
  const k = Math.min(topK, index.ntotal());
  if (k === 0) return [];
  
  const searchResults = index.search(queryVector, k);
  console.log("\n[TRACE] Raw FAISS Distances:", searchResults.distances);
  console.log("[TRACE] Raw FAISS Labels:", searchResults.labels);
  
  const retrieved = [];
  for (let i = 0; i < searchResults.labels.length; i++) {
    const label = searchResults.labels[i];
    const score = searchResults.distances[i];
    if (label >= 0 && label < metadata.length && score >= similarityThreshold) {
      retrieved.push({
        ...metadata[label],
        score
      });
    }
  }
  return retrieved;
}

export async function queryDocument(question, documentId, topK = 5, similarityThreshold = -1) {
  console.log("\n==================================================");
  console.log("[TRACE] Starting Retrieval Pipeline");
  console.log(`[TRACE] Question: "${question}"`);
  console.log(`[TRACE] Target DocumentID: ${documentId}`);

  const indexPath = path.join("data", "indexes", `${documentId}.index`);
  const metaPath = path.join("data", "metadata", `${documentId}.json`);

  if (!fs.existsSync(indexPath) || !fs.existsSync(metaPath)) {
    throw new Error(`Document ID ${documentId} not found.`);
  }

  // Load FAISS index and metadata
  const index = faiss.Index.read(indexPath);
  const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

  let currentQuestion = question;
  let queryVector = await embedText(currentQuestion);
  console.log(`[TRACE] Query embedding dimension: ${queryVector.length}`);
  console.log(`[TRACE] FAISS Index Size: ${index.ntotal()}`);

  let chunks = await retrieveChunks(queryVector, index, metadata, topK, similarityThreshold);
  console.log(`[TRACE] Chunks retrieved after score filter (threshold=${similarityThreshold}): ${chunks.length}`);
  
  if (chunks.length > 0) {
    console.log("[TRACE] Retrieved Chunk Previews:");
    chunks.forEach((c, i) => console.log(`  - [id: ${c.embeddingId}, score: ${c.score.toFixed(4)}] ${c.text.substring(0, 50).replace(/\n/g, " ")}...`));
  }

  let rewrittenQuestion = null;
  
  if (chunks.length > 0) {
    const isRelevant = await evaluateRelevance(currentQuestion, chunks);
    console.log(`[TRACE] CRAG Evaluation Relevance: ${isRelevant ? 'YES' : 'NO'}`);
    
    // For summarization queries, or if we have chunks, we want to bypass CRAG rejection so we don't return 0 chunks
    // The user requested to fallback to top chunks if retrieval scores are low but chunks exist.
    if (!isRelevant && !question.toLowerCase().includes("summarize")) {
      console.log("[TRACE] CRAG: Low relevance detected. Reformulating query...");
      rewrittenQuestion = await reformulateQuestion(currentQuestion);
      currentQuestion = rewrittenQuestion;
      queryVector = await embedText(currentQuestion);
      chunks = await retrieveChunks(queryVector, index, metadata, topK, similarityThreshold);
    } else if (!isRelevant) {
      console.log("[TRACE] CRAG: Low relevance detected, but bypassed due to summarization fallback.");
    }
  } else {
    console.log("[TRACE] CRAG: No chunks found. Reformulating query...");
    rewrittenQuestion = await reformulateQuestion(currentQuestion);
    currentQuestion = rewrittenQuestion;
    queryVector = await embedText(currentQuestion);
    chunks = await retrieveChunks(queryVector, index, metadata, topK, similarityThreshold);
  }

  let finalChunks = chunks;
  if (chunks.length > 1) {
     console.log("[TRACE] Reranking chunks...");
     finalChunks = await rerankChunks(currentQuestion, chunks);
  }

  // Keep top 5 after reranking (as requested)
  finalChunks = finalChunks.slice(0, 5);
  console.log(`[TRACE] Chunks after reranking: ${finalChunks.length}`);

  if (finalChunks.length === 0) {
    console.log("[TRACE] Final result: 0 chunks.");
    return {
      answer: "I could not find any relevant content in the document to answer your question.",
      sources: [],
      crag: { originalQuestion: question, rewrittenQuestion }
    };
  }

  // Remove Chunk 1, Chunk 2 labels to prevent LLM from repeating them
  const context = finalChunks
    .map(c => `DOCUMENT EXCERPT:\n---\n\n${c.text}\n\n---`)
    .join("\n\n");

  console.log("[TRACE] Final Context Sent to LLM length:", context.length);

  // Extract answer mode from query or use default
  let modeInstruction = "Answer naturally and professionally as if you had directly read the document.";
  const qLower = question.toLowerCase();
  if (qLower.includes("bullet")) {
    modeInstruction = "Provide structured bullets for easy reading.";
  } else if (qLower.includes("technical") || qLower.includes("architecture") || qLower.includes("engineering")) {
    modeInstruction = "Provide an engineering-focused, technical explanation.";
  } else if (qLower.includes("detail") || qLower.includes("comprehensive")) {
    modeInstruction = "Provide a comprehensive and detailed explanation.";
  } else if (qLower.includes("summarize") || qLower.includes("summary")) {
    modeInstruction = "Provide a natural executive summary.";
  }

  const systemPrompt = `You are a precise, professional document assistant.
Your ONLY source of information is the provided document excerpts.

Rules:
1. Answer ONLY using the information from the provided context.
2. Refuse to answer if the answer cannot be found in the context. Say exactly: "This information is not available in the uploaded document."
3. NO HALLUCINATIONS. Do not include outside knowledge.
4. ${modeInstruction}
5. Do not mention chunk numbers, retrieval blocks, vector search, embeddings, context windows, or internal system details. 
6. Never start answers with "According to the excerpt..." or "Chunk 1 says...". Just provide the answer directly.

DOCUMENT CONTEXT:
${context}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: currentQuestion },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    console.log("[TRACE] LLM generation successful.");

    return {
      answer: completion.choices[0].message.content,
      sources: finalChunks.map(c => ({
        text: c.text.slice(0, 200) + "...",
        score: Math.round(c.score * 100),
        chunkIndex: c.index,
        filename: c.sourceFilename
      })),
      crag: {
        originalQuestion: question,
        rewrittenQuestion: rewrittenQuestion,
        retrievalScores: finalChunks.map(c => Math.round(c.score * 100))
      }
    };
  } catch (e) {
    console.error("[TRACE] LLM generation failed:", e.message);
    throw e;
  }
}
