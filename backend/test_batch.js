import { embedBatch } from "./embeddings.js";

async function test() {
  const vectors = await embedBatch(["hello", "world"]);
  console.log("Vectors length:", vectors.length);
  if (vectors.length > 0) {
    console.log("Vector 0 length:", vectors[0].length);
    if (Array.isArray(vectors[0]) && vectors[0].length > 0) {
       console.log("Vector 0[0] type:", typeof vectors[0][0]);
    }
  }
}

test();
