import type { MetaSnapshot, PokemonUsageStats } from './types.js';

/**
 * Integracion con las estadisticas publicas de uso de Smogon
 * (https://www.smogon.com/stats/). Estas son el mismo dato crudo que consumen
 * Pikalytics y VGCPastes para sus rankings, publicado mensualmente como JSON
 * "chaos" por formato y corte de rating (ladder cutoff, ej. 0, 1500, 1760).
 *
 * Requiere que el entorno donde corre el CLI tenga salida de red hacia
 * smogon.com. Si el fetch falla (sin red, mes sin datos para el formato,
 * cambio de esquema, etc.) el caller debe recurrir al dataset semilla
 * (ver `./seedData.ts`).
 */

const BASE_URL = 'https://www.smogon.com/stats';

export interface FetchStatsOptions {
  /** "YYYY-MM". Por defecto, el mes calendario anterior (los stats del mes actual aun no existen). */
  month?: string;
  /** Corte de ELO del ladder. 0 = todos los combates; valores mas altos = jugadores mas fuertes. */
  cutoff?: number;
}

function previousMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface ChaosJson {
  info: { metagame: string; cutoff: number; 'number of battles': number };
  data: Record<string, {
    'Raw count': number;
    usage: number;
    Abilities: Record<string, number>;
    Items: Record<string, number>;
    Spreads: Record<string, number>;
    Moves: Record<string, number>;
    Teammates: Record<string, number>;
    'Checks and Counters': Record<string, [number, number, number]>;
  }>;
}

function normalize(entries: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(entries).sort((a, b) => b[1] - a[1]));
}

function parseChaos(json: ChaosJson, format: string, month: string): MetaSnapshot {
  const pokemon: PokemonUsageStats[] = Object.entries(json.data)
    .filter(([name]) => name !== 'empty')
    .map(([species, d]) => ({
      species,
      usagePercent: d.usage,
      rawCount: d['Raw count'],
      abilities: normalize(d.Abilities ?? {}),
      items: normalize(d.Items ?? {}),
      spreads: normalize(d.Spreads ?? {}),
      moves: normalize(d.Moves ?? {}),
      teammates: normalize(d.Teammates ?? {}),
      checksAndCounters: d['Checks and Counters'] ?? {},
    }))
    .sort((a, b) => b.usagePercent - a.usagePercent);

  return {
    format,
    updatedAt: new Date().toISOString(),
    source: 'live',
    month,
    battles: json.info?.['number of battles'],
    pokemon,
  };
}

/** Descarga y parsea las estadisticas de uso mensuales de Smogon para un formato VGC dado. */
export async function fetchSmogonStats(format: string, opts: FetchStatsOptions = {}): Promise<MetaSnapshot> {
  const month = opts.month ?? previousMonth();
  const cutoffsToTry = opts.cutoff != null ? [opts.cutoff] : [1760, 1630, 1500, 0];

  let lastError: unknown;
  for (const cutoff of cutoffsToTry) {
    const url = `${BASE_URL}/${month}/chaos/${format}-${cutoff}.json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} en ${url}`);
        continue;
      }
      const json = (await res.json()) as ChaosJson;
      return parseChaos(json, format, month);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `No se pudieron obtener estadisticas de Smogon para ${format} (${month}). ` +
      `Verifica conectividad hacia smogon.com o que el formato tenga datos publicados ese mes. ` +
      `Ultimo error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
