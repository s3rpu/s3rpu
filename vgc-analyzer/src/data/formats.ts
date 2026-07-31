import { Dex } from '@pkmn/sim';

/**
 * Resolucion del formato VGC vigente.
 *
 * @pkmn/sim trae embebidos los formatos que existian en la version del paquete
 * instalada. Cuando Game Freak / Play! Pokemon publiquen un nuevo Reglamento,
 * `npm update @pkmn/sim` lo incorpora sin tocar este archivo: detectamos el
 * "mas nuevo" formato VGC por orden de aparicion en Dex.formats (Showdown los
 * lista del mas reciente al mas antiguo dentro de cada generacion).
 */
export function listVgcFormats(): { id: string; name: string }[] {
  return Dex.formats
    .all()
    .filter((f) => /^gen9vgc/.test(f.id))
    .map((f) => ({ id: f.id, name: f.name }));
}

function regSortKey(id: string): [number, number] {
  const m = /^gen9vgc(\d{4})reg([a-z])/.exec(id);
  if (!m) return [0, 0];
  const year = parseInt(m[1]!, 10);
  const letter = m[2]!.charCodeAt(0);
  return [year, letter];
}

/**
 * El Reglamento vigente es el mas reciente disponible en el paquete @pkmn/sim
 * instalado (mayor anio, y a igualdad de anio, mayor letra de Reglamento).
 * `npm update @pkmn/sim` trae reglamentos nuevos sin tocar este archivo.
 */
export function currentVgcFormat(): string {
  const envOverride = process.env.VGC_FORMAT;
  if (envOverride) return envOverride;
  const formats = listVgcFormats();
  if (formats.length === 0) return 'gen9vgc2025regi';
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
