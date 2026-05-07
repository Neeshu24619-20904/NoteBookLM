# NotebookLM Clone — RAG Application

A full RAG (Retrieval-Augmented Generation) pipeline that lets you upload any PDF or text document and have a conversation with it.

## Live Demo
- **Frontend**: [your-vercel-url]
- **Backend**: [your-render-url]

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM (Generation) | Groq `llama-3.3-70b-versatile` |
| Embeddings | `@xenova/transformers` · `all-MiniLM-L6-v2` (384-dim, local) |
| Vector Database | Qdrant Cloud |
| PDF Parsing | `pdf-parse` |
| Backend | Node.js + Express |
| Frontend | React + Vite |

---

## RAG Pipeline

```
PDF/TXT Upload
     ↓
[1] PARSE      pdf-parse extracts raw text
     ↓
[2] CHUNK      Fixed-size chunking (800 chars, 150 overlap)
     ↓
[3] EMBED      MiniLM-L6-v2 → 384-dim vectors (local, no API)
     ↓
[4] STORE      Qdrant Cloud vector DB (cosine similarity)
     ↓
[5] QUERY      User question → embed → search top-4 chunks
     ↓
[6] GENERATE   Groq LLM answers from retrieved context only
```

### Chunking Strategy: Fixed-size with overlap

Each document is split into **800-character chunks** with a **150-character overlap** between consecutive chunks.

**Why overlap?** Sentences at chunk boundaries would otherwise be split across two chunks, losing their context. The 150-char overlap ensures boundary content appears in both adjacent chunks, preserving semantic continuity.

```
|--- chunk 1 (800) ---|
               |--- chunk 2 (800) ---|
               ^--- 150 overlap ---^
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- Qdrant Cloud account (free at cloud.qdrant.io)
- Groq API key (free at console.groq.com)

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your keys in .env
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

**backend/.env**
```
GROQ_API_KEY=your_groq_key
QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your_qdrant_key
PORT=3001
```

**frontend/.env** (for production)
```
VITE_API_URL=https://your-render-backend-url
```

---

## Deployment

### Backend → Render.com
1. Push to GitHub
2. New Web Service on Render → connect repo → select `backend/` as root
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render dashboard

### Frontend → Vercel
1. New project on Vercel → connect repo → select `frontend/` as root
2. Add env variable: `VITE_API_URL=https://your-render-url`
3. Deploy

---

## API Endpoints

### `POST /upload`
Uploads and indexes a document.
- Body: `multipart/form-data` with `file` field
- Returns: `{ collectionName, chunkCount, filename }`

### `POST /ask`
Asks a question about an indexed document.
- Body: `{ question: string, collectionName: string }`
- Returns: `{ answer: string, sources: [{ text, score }] }`
