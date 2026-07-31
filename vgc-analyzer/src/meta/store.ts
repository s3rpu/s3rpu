import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MetaSnapshot } from './types.js';
import { fetchSmogonStats } from './smogonStats.js';
import { seedMetaSnapshot } from './seedData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

function cachePath(format: string): string {
  return join(DATA_DIR, `meta-${format}.json`);
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function saveSnapshot(snapshot: MetaSnapshot): string {
  ensureDataDir();
  const path = cachePath(snapshot.format);
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf-8');
  return path;
}

export function loadCachedSnapshot(format: string): MetaSnapshot | undefined {
  const path = cachePath(format);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf-8')) as MetaSnapshot;
}

/**
 * Intenta refrescar el snapshot de meta desde Smogon Stats (datos reales).
 * Si falla (sin red, mes no publicado, etc.) cae al dataset semilla incluido
 * y lo persiste igual, para que el resto de la app siempre tenga algo con
 * que trabajar. El campo `source` del snapshot deja explicito cual paso.
 */
export async function updateMeta(format: string, opts: { month?: string } = {}): Promise<{ snapshot: MetaSnapshot; usedFallback: boolean; error?: string }> {
  try {
    const snapshot = await fetchSmogonStats(format, opts);
    saveSnapshot(snapshot);
    return { snapshot, usedFallback: false };
  } catch (err) {
    const snapshot = seedMetaSnapshot(format);
    saveSnapshot(snapshot);
    return { snapshot, usedFallback: true, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Obtiene el snapshot vigente: cache local si existe, si no dataset semilla (sin tocar disco). */
export function getSnapshotOrSeed(format: string): MetaSnapshot {
  return loadCachedSnapshot(format) ?? seedMetaSnapshot(format);
}
