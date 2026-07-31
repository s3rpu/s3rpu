import ShowdownPS from 'pokemon-showdown';
const { Dex } = ShowdownPS;

/**
 * Resolucion del formato vigente de Pokemon Champions VGC.
 *
 * Pokemon Champions (lanzado en Switch el 8/4/2026) es, desde 2026, el
 * software oficial de VGC para el Circuito de Campeonato y el Mundial. Sus
 * formatos en el motor de Showdown viven bajo el mod `champions`/`championsregma`
 * con ids como `gen9championsvgc2026regmb`. Filtramos por "vgc" + gameType
 * doubles para excluir BSS (singles) y Random Battle.
 */
export function listChampionsVgcFormats(): { id: string; name: string; mod: string }[] {
  return Dex.formats
    .all()
    .filter((f) => /^gen9champions/.test(f.id) && /vgc/i.test(f.id) && f.gameType === 'doubles')
    .map((f) => ({ id: f.id, name: f.name, mod: f.mod ?? 'champions' }));
}

/** Mantiene el nombre anterior por compatibilidad interna del codigo. */
export const listVgcFormats = listChampionsVgcFormats;

function regSortKey(id: string): [number, number] {
  // ids tipicos: gen9championsvgc2026regma, gen9championsvgc2026regmb, ...bo3 variantes
  const m = /^gen9championsvgc(\d{4})regm([a-z])/.exec(id);
  if (!m) return [0, 0];
  const year = parseInt(m[1]!, 10);
  const letter = m[2]!.charCodeAt(0);
  return [year, letter];
}

/**
 * El Reglamento vigente es el mas reciente disponible (mayor anio, a igualdad
 * de anio mayor letra), excluyendo variantes "Bo3" (mismo Reglamento, solo
 * cambia el formato de partido a mejor-de-3). `npm update pokemon-showdown`
 * trae reglamentos nuevos sin tocar este archivo.
 */
export function currentVgcFormat(): string {
  const envOverride = process.env.VGC_FORMAT;
  if (envOverride) return envOverride;
  const formats = listChampionsVgcFormats().filter((f) => !/bo3$/i.test(f.id));
  if (formats.length === 0) return 'gen9championsvgc2026regmb';
  return formats
    .slice()
    .sort((a, b) => {
      const [ya, la] = regSortKey(a.id);
      const [yb, lb] = regSortKey(b.id);
      return yb - ya || lb - la;
    })[0]!.id;
}

export function formatExists(id: string): boolean {
  return !!Dex.formats.get(id)?.exists;
}
