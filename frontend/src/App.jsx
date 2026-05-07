import { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "";

function UploadZone({ onUpload, isLoading }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf" && file.type !== "text/plain") {
      alert("Only PDF or .txt files are supported.");
      return;
    }
    onUpload(file);
  };

  return (
    <div
      onClick={() => !isLoading && fileRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "12px",
        padding: "48px 32px",
        textAlign: "center",
        cursor: isLoading ? "not-allowed" : "pointer",
        background: dragging ? "rgba(232,255,71,0.04)" : "var(--surface)",
        transition: "all 0.2s ease",
      }}
    >
      <input ref={fileRef} type="file" accept=".pdf,.txt" hidden onChange={(e) => handleFile(e.target.files[0])} />
      <div style={{ fontSize: "32px", marginBottom: "12px" }}>
        {isLoading ? "⏳" : "📄"}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, marginBottom: "8px", color: "var(--text)" }}>
        {isLoading ? "Processing document..." : "Drop your document here"}
      </div>
      <div style={{ color: "var(--muted)", fontSize: "12px" }}>
        {isLoading ? "Chunking → Embedding → Indexing into Qdrant" : "PDF or TXT · Max 20MB · Click or drag"}
      </div>
      {isLoading && (
        <div style={{ marginTop: "20px", display: "flex", gap: "6px", justifyContent: "center" }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: "var(--accent)",
              animation: `pulse 1.2s ease ${i * 0.2}s infinite`
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ msg, index }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="animate-fadeup"
      style={{
        animationDelay: `${index * 0.05}s`,
        opacity: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: "20px",
      }}
    >
      <div style={{
        fontSize: "10px",
        color: "var(--muted)",
        marginBottom: "6px",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}>
        {isUser ? "you" : "notebook"}
      </div>
      <div style={{
        maxWidth: "80%",
        padding: "14px 18px",
        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: isUser ? "var(--user-bubble)" : "var(--ai-bubble)",
        border: `1px solid ${isUser ? "var(--border)" : "rgba(71,255,212,0.15)"}`,
        color: "var(--text)",
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
      {msg.sources && msg.sources.length > 0 && (
        <div style={{ maxWidth: "80%", marginTop: "8px" }}>
          <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Sources used
          </div>
          {msg.sources.map((s, i) => (
            <div key={i} style={{
              fontSize: "11px",
              color: "var(--muted)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "8px 10px",
              marginBottom: "4px",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}>
              <span style={{ color: "var(--accent2)", flexShrink: 0, fontWeight: 600 }}>{s.score}%</span>
              <span style={{ opacity: 0.8 }}>{s.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [doc, setDoc] = useState(null); // { collectionName, filename, chunkCount }
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef();
  const inputRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const handleUpload = async (file) => {
    setUploading(true);
    setError(null);
    setMessages([]);
    setDoc(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/upload`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDoc(data);
      setMessages([{
        role: "assistant",
        content: `Document ready! I've indexed "${data.filename}" into ${data.chunkCount} chunks. Ask me anything about it.`,
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAsk = async () => {
    if (!input.trim() || !doc || thinking) return;
    const question = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: question }]);
    setThinking(true);
    setError(null);

    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, collectionName: doc.collectionName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        padding: "20px 32px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--surface)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "32px", height: "32px", background: "var(--accent)",
            borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "16px",
          }}>📓</div>
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              NotebookLM
            </div>
            <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              RAG · Groq · Qdrant
            </div>
          </div>
        </div>
        {doc && (
          <div style={{
            fontSize: "11px",
            background: "rgba(232,255,71,0.08)",
            border: "1px solid rgba(232,255,71,0.2)",
            color: "var(--accent)",
            padding: "6px 12px",
            borderRadius: "20px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
            {doc.filename} · {doc.chunkCount} chunks
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <div style={{
          width: "320px",
          borderRight: "1px solid var(--border)",
          padding: "24px",
          background: "var(--surface)",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          overflowY: "auto",
        }}>
          <div>
            <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
              Document
            </div>
            <UploadZone onUpload={handleUpload} isLoading={uploading} />
          </div>

          {doc && (
            <div style={{ animation: "fadeUp 0.4s ease forwards" }}>
              <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
                Pipeline
              </div>
              {[
                ["01", "PDF Parsed", "✓"],
                ["02", `${doc.chunkCount} Chunks Created`, "✓"],
                ["03", "Embedded (MiniLM-L6)", "✓"],
                ["04", "Stored in Qdrant", "✓"],
                ["05", "Ready for RAG", "✓"],
              ].map(([num, label, status]) => (
                <div key={num} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "12px",
                }}>
                  <span style={{ color: "var(--muted)", fontWeight: 600, minWidth: "20px" }}>{num}</span>
                  <span style={{ flex: 1, color: "var(--text)" }}>{label}</span>
                  <span style={{ color: "var(--accent2)" }}>{status}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
              Stack
            </div>
            {[
              ["LLM", "Groq llama-3.3-70b"],
              ["Embeddings", "MiniLM-L6-v2 (384d)"],
              ["Vector DB", "Qdrant Cloud"],
              ["Chunking", "Fixed-size + overlap"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "11px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ color: "var(--muted)" }}>{k}</span>
                <span style={{ color: "var(--accent2)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
            {messages.length === 0 && !uploading && (
              <div style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
                textAlign: "center",
                gap: "12px",
              }}>
                <div style={{ fontSize: "48px", opacity: 0.3 }}>💬</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, color: "var(--text)", opacity: 0.3 }}>
                  Upload a document to begin
                </div>
                <div style={{ fontSize: "12px", opacity: 0.5, maxWidth: "300px" }}>
                  Drop any PDF or text file on the left panel, then ask questions about its contents.
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <Message key={i} msg={msg} index={i} />
            ))}

            {thinking && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--muted)", fontSize: "12px" }}>
                <div style={{
                  width: "16px", height: "16px", border: "2px solid var(--border)",
                  borderTopColor: "var(--accent2)", borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }} />
                Retrieving from Qdrant · Generating with Groq...
              </div>
            )}

            {error && (
              <div style={{
                padding: "12px 16px",
                background: "rgba(255,80,80,0.08)",
                border: "1px solid rgba(255,80,80,0.2)",
                borderRadius: "8px",
                color: "#ff8080",
                fontSize: "12px",
                marginBottom: "16px",
              }}>
                ⚠ {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "20px 32px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            gap: "12px",
            alignItems: "flex-end",
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
              placeholder={doc ? "Ask anything about your document..." : "Upload a document first..."}
              disabled={!doc || thinking}
              rows={1}
              style={{
                flex: 1,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "12px 16px",
                color: "var(--text)",
                fontSize: "14px",
                outline: "none",
                resize: "none",
                maxHeight: "120px",
                transition: "border-color 0.2s",
                opacity: !doc ? 0.5 : 1,
              }}
              onFocus={e => e.target.style.borderColor = "var(--accent)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
            <button
              onClick={handleAsk}
              disabled={!doc || !input.trim() || thinking}
              style={{
                background: doc && input.trim() && !thinking ? "var(--accent)" : "var(--surface2)",
                color: doc && input.trim() && !thinking ? "#000" : "var(--muted)",
                border: "none",
                borderRadius: "10px",
                padding: "12px 20px",
                fontWeight: 700,
                fontSize: "13px",
                fontFamily: "var(--font-display)",
                transition: "all 0.2s ease",
                letterSpacing: "0.02em",
              }}
            >
              Ask →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
