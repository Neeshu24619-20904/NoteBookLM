import faiss from 'faiss-node';

try {
  const index = new faiss.IndexFlatIP(10);
  index.write('test.index');
  const index2 = faiss.IndexFlatIP.read ? faiss.IndexFlatIP.read('test.index') : faiss.Index.read('test.index');
  console.log("Success reading index", index2.ntotal());
} catch (e) {
  console.error("Error:", e);
}
