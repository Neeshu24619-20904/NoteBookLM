import express from "express";
import multer from "multer";
import cors from "cors";
import { ingestDocument } from "./ingest.js";
import { queryDocument } from "./query.js";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Multer config - accept PDF and txt
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
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
  res.json({ status: "NotebookLM backend running ✅" });
});

// Upload & index document
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    console.log(`Processing: ${req.file.originalname}`);
    const result = await ingestDocument(req.file.path, req.file.mimetype);

    res.json({
      success: true,
      collectionName: result.collectionName,
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
    const { question, collectionName } = req.body;

    if (!question || !collectionName) {
      return res.status(400).json({ error: "question and collectionName are required." });
    }

    const result = await queryDocument(question, collectionName);
    res.json(result);
  } catch (err) {
    console.error("Query error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
