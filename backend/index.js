import express from "express";
import multer from "multer";
import cors from "cors";
import path from "path";
import fs from "fs";
import faiss from "faiss-node";
import { ingestDocument } from "./ingest.js";
import { queryDocument } from "./query.js";
import { embedText } from "./embeddings.js";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Ensure upload directory exists
const uploadDir = path.join("data", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config - accept PDF and txt
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max as requested
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.mimetype === "text/plain"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and .txt files are supported."));
    }
  },
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "NotebookLM backend running with FAISS ✅" });
});

// Upload & index document
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    console.log(`Processing: ${req.file.originalname}`);
    const result = await ingestDocument(req.file.path, req.file.mimetype, req.file.originalname);

    res.json({
      success: true,
      documentId: result.documentId,
      chunkCount: result.chunkCount,
      filename: req.file.originalname,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Ask a question
app.post("/ask", async (req, res) => {
  try {
    const { question, documentId, topK, similarityThreshold } = req.body;

    if (!question || !documentId) {
      return res.status(400).json({ 
        error: "documentId missing", 
        received: req.body 
      });
    }

    const result = await queryDocument(question, documentId, topK, similarityThreshold);
    res.json(result);
  } catch (err) {
    console.error("Query error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/debug/document/:documentId", (req, res) => {
  try {
    const documentId = req.params.documentId;
    const indexPath = path.join("data", "indexes", `${documentId}.index`);
    const metaPath = path.join("data", "metadata", `${documentId}.json`);

    if (!fs.existsSync(indexPath) || !fs.existsSync(metaPath)) {
      return res.status(404).json({ error: "Document not found." });
    }

    const index = faiss.Index.read(indexPath);
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

    res.json({
      chunkCount: metadata.length,
      vectorCount: index.ntotal(),
      metadataCount: metadata.length,
      indexSize: fs.statSync(indexPath).size,
      sampleChunks: metadata.slice(0, 2)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/debug/retrieval/:documentId", async (req, res) => {
  try {
    const documentId = req.params.documentId;
    const question = req.query.q || "test";
    
    const indexPath = path.join("data", "indexes", `${documentId}.index`);
    const metaPath = path.join("data", "metadata", `${documentId}.json`);

    if (!fs.existsSync(indexPath) || !fs.existsSync(metaPath)) {
      return res.status(404).json({ error: "Document not found." });
    }

    const index = faiss.Index.read(indexPath);
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

    const queryVector = await embedText(question);
    const k = Math.min(5, index.ntotal());
    let searchResults = { labels: [], distances: [] };
    if (k > 0) {
      searchResults = index.search(queryVector, k);
    }
    
    const retrieved = [];
    for (let i = 0; i < searchResults.labels.length; i++) {
      const label = searchResults.labels[i];
      const score = searchResults.distances[i];
      if (label >= 0 && label < metadata.length) {
        retrieved.push({
          ...metadata[label],
          score
        });
      }
    }

    res.json({
      query: question,
      rawResults: { labels: Array.from(searchResults.labels), distances: Array.from(searchResults.distances) },
      filteredResults: retrieved,
      scores: retrieved.map(c => c.score),
      chunkPreview: retrieved.map(c => c.text.substring(0, 100)),
      thresholdUsed: -1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
