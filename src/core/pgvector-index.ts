import type { PgPoolLike } from './memory-postgres.ts';
import type { VectorSearchHit } from './vector-index.ts';

export interface AsyncVectorIndex {
  add(id: string, vector: number[]): Promise<void>;
  remove(id: string): Promise<void>;
  search(vector: number[], topK: number): Promise<VectorSearchHit[]>;
}

export interface PgVectorIndexOptions {
  pool: PgPoolLike;
  table?: string;
  idColumn?: string;
  embeddingColumn?: string;
}

function toVector(vector: number[]): string {
  return '[' + vector.map((value) => Number(value)).join(',') + ']';
}

export class PgVectorIndex implements AsyncVectorIndex {
  private readonly pool: PgPoolLike;
  private readonly table: string;
  private readonly idColumn: string;
  private readonly embeddingColumn: string;

  constructor(opts: PgVectorIndexOptions) {
    this.pool = opts.pool;
    this.table = opts.table ?? 'memories';
    this.idColumn = opts.idColumn ?? 'id';
    this.embeddingColumn = opts.embeddingColumn ?? 'embedding';
  }

  async add(id: string, vector: number[]): Promise<void> {
    await this.pool.query(
      'UPDATE ' + this.table + ' SET ' + this.embeddingColumn + ' = $1::vector WHERE ' + this.idColumn + ' = $2',
      [toVector(vector), id]
    );
  }

  async remove(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE ' + this.table + ' SET ' + this.embeddingColumn + ' = NULL WHERE ' + this.idColumn + ' = $1',
      [id]
    );
  }

  async search(vector: number[], topK: number): Promise<VectorSearchHit[]> {
    const result = await this.pool.query(
      'SELECT ' + this.idColumn + ' AS id, ' + this.embeddingColumn + ' <=> $1::vector AS distance FROM ' + this.table +
      ' WHERE ' + this.embeddingColumn + ' IS NOT NULL ORDER BY ' + this.embeddingColumn + ' <=> $1::vector LIMIT $2',
      [toVector(vector), topK]
    );
    return (result.rows as Array<{ id: string; distance: number | string }>).map((row) => ({
      id: row.id,
      score: 1 - Number(row.distance)
    }));
  }
}
