export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorSearchHit {
  id: string;
  score: number;
}

export interface VectorIndex {
  add(id: string, vector: number[]): void;
  remove(id: string): void;
  search(vector: number[], topK: number): VectorSearchHit[];
  size(): number;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class InMemoryVectorIndex implements VectorIndex {
  private readonly vectors = new Map<string, number[]>();

  add(id: string, vector: number[]): void {
    this.vectors.set(id, [...vector]);
  }

  remove(id: string): void {
    this.vectors.delete(id);
  }

  search(vector: number[], topK: number): VectorSearchHit[] {
    const hits: VectorSearchHit[] = [];
    for (const [id, stored] of this.vectors) {
      hits.push({ id, score: cosine(vector, stored) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  size(): number {
    return this.vectors.size;
  }
}
