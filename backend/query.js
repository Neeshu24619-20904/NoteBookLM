import { QdrantClient } from "@qdrant/js-client-rest";
import Groq from "groq-sdk";
import { embedText } from "./embeddings.js";
import "dotenv/config";

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function queryDocument(question, collectionName) {
  // 1. Embed the user's question
  const queryVector = await embedText(question);

  // 2. Retrieve top 4 most relevant chunks from Qdrant
  const results = await qdrant.search(collectionName, {
    vector: queryVector,
    limit: 4,
    with_payload: true,
  });

  if (!results || results.length === 0) {
    return {
      answer: "I could not find any relevant content in the document to answer your question.",
      sources: [],
    };
  }

  // 3. Build context from retrieved chunks
  const context = results
    .map((r, i) => `[Chunk ${i + 1}]:\n${r.payload.text}`)
    .join("\n\n");

  // 4. Generate grounded answer using Groq
  const systemPrompt = `You are a precise document assistant. Your job is to answer questions based ONLY on the document context provided below.

Rules:
- Answer ONLY from the provided context. Do not use outside knowledge.
- If the answer is not found in the context, say exactly: "This information is not available in the uploaded document."
- Be concise but complete.
- Reference specific parts of the context when relevant.

DOCUMENT CONTEXT:
${context}`;

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
    temperature: 0.2,
    max_tokens: 1024,
  });

  return {
    answer: completion.choices[0].message.content,
    sources: results.map((r) => ({
      text: r.payload.text.slice(0, 200) + "...",
      score: Math.round(r.score * 100),
    })),
  };
}
