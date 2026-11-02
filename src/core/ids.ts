import { randomUUID } from 'node:crypto';

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type EventId = Brand<string, 'EventId'>;
export type MemoryId = Brand<string, 'MemoryId'>;
export type SessionId = Brand<string, 'SessionId'>;

export function newId<T extends string>(prefix: string): Brand<string, T> {
  return (prefix + '-' + randomUUID()) as Brand<string, T>;
}

export function now(): number {
  return Date.now();
}
