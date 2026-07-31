# VGC Analyzer — Pokémon Champions

Herramienta de análisis competitivo para **Pokémon Champions VGC** (Reg M-B, el software oficial de VGC desde 2026), en Node.js/TypeScript. CLI en `vgc`, motor de datos del meta, simulador de combates sobre el motor oficial de Pokémon Showdown (paquete `pokemon-showdown`, con soporte real del mod `champions`) y constructor de equipos con validación de sinergia.

## Instalación

```bash
cd vgc-analyzer
npm install
```

### Modo desarrollo (sin compilar)

```bash
npm run cli -- formats
```

### Como ejecutable de verdad

```bash
npm run build          # compila a dist/ y deja dist/cli/index.js ejecutable
./dist/cli/index.js formats
```

O instalalo como comando global `vgc` (usa el `bin` del `package.json`):

```bash
npm run build
npm link                # crea el symlink global "vgc" -> dist/cli/index.js
vgc formats
vgc sim battle -1 examples/team-balance-core.txt -2 examples/team-rain-weather.txt
```

`npm link` requiere permisos de escritura en la carpeta global de npm (con nvm no hace falta sudo). Para desinstalar el comando global: `npm unlink -g vgc-analyzer`. Los ejemplos de abajo usan `npm run cli --` pero funcionan igual con `vgc` una vez linkeado.

## Sobre el motor: `pokemon-showdown`, no `@pkmn/sim`

Al momento de escribir esto, el paquete `@pkmn/sim` (la libreria TS mas usada para este tipo de herramientas) **todavia no sincronizo** los datos del mod `champions` que Showdown agrego para Pokémon Champions. El paquete oficial **`pokemon-showdown`** (mantenido por Smogon, el mismo codigo que corre en play.pokemonshowdown.com) sí lo trae, asi que esta herramienta corre directamente sobre el. Esto trae dos particularidades:

- El paquete es el servidor completo de Showdown (incluye chat, base de datos, SMTP para el sistema de mail interno, etc.), asi que `npm audit` va a mostrar vulnerabilidades en dependencias de ESA parte del paquete (nodemailer, sqlite3, sockjs). Esta herramienta **solo usa los modulos `sim/` y `data/`** (motor de batalla y datos), nunca el servidor/chat/mail, asi que esas vulnerabilidades no aplican a como se usa aca. No corras `npm audit fix --force`: bajaria `pokemon-showdown` a una version vieja sin soporte de Champions.
- Sus modulos son CommonJS empaquetados con esbuild; el interop con ESM de Node no siempre detecta los exports con nombre, por eso el codigo importa el default y desestructura (`import PS from 'pokemon-showdown'; const { Dex } = PS;`) en vez de `import { Dex } from 'pokemon-showdown'`.

## 1. Motor de datos del meta

- `src/data/dex.ts` / `src/data/formats.ts`: acceso "mod-aware" a especies, movimientos, objetos, habilidades, tipos (via `Dex.forFormat(formatId)`, que ya trae Megas y banlist aplicados) y detección automática del Reglamento vigente (mayor año/letra Reg M-* disponible — `npm update pokemon-showdown` trae reglamentos nuevos sin tocar código).
- `src/meta/smogonStats.ts`: integración real con [Smogon Stats](https://www.smogon.com/stats/) (mismo dato crudo — JSON "chaos" mensual por formato — que consumen Pikalytics/VGCPastes): uso, sets, objetos, SP y % de compañeros de equipo.
- `src/meta/store.ts`: cache local en JSON (`data/meta-<formato>.json`) con timestamp de última actualización (`vgc meta update`).
- `src/meta/roles.ts` + `src/meta/metaEngine.ts`: clasifica el "core meta" (top N) por rol (clima, terreno, Trick Room, control de velocidad, redirección, Intimidate, pivote, setup, choice lock, **Mega evolucionador**, soporte, tanque) y expone sus counters más comunes (Checks & Counters de Smogon).

**Nota sobre red:** este entorno de ejecución sandboxed bloquea la salida a `smogon.com` (y a la mayoría de sitios de terceros como Pikalytics), así que `meta update` no puede alcanzarlos aquí y cae automáticamente a un **dataset semilla** (`src/meta/seedData.ts`, 17 pokémon), marcado explícitamente `source: 'seed'`. Ese dataset **no es inventado al azar**: el ranking de uso, y los movesets/items de Garchomp, Kingambit, Whimsicott, Sinistcha y Basculegion, están tomados de reportes públicos reales del meta de julio 2026 (Pikalytics, ~160k combates de Reg M-B); el resto (spreads exactos, % de counters) es una reconstrucción razonable. En una máquina con salida de red normal, `vgc meta update` reemplaza este snapshot con datos reales de Smogon y lo marca `source: 'live'`.

## 2. Simulador de combates

Sobre el motor oficial de Pokémon Showdown (daño, IA vía `RandomPlayerAI`, objetos/habilidades/Mega Evolución/Tera tal como en el juego):

- `src/sim/battle.ts` — combate único entre equipo A y equipo B (`vgc sim battle`).
- `src/sim/monteCarlo.ts` — N combates con variabilidad real de IA/orden (ninguna semilla se fija), agrega win rate, líneas de juego más comunes, MVPs (supervivencia) y "quién muere primero" (`vgc sim montecarlo`).
- `src/sim/gauntlet.ts` — un equipo contra **todos** los equipos top del meta a la vez, no solo un rival (`vgc sim gauntlet`).

## 3. Constructor de equipos con validación de sinergia

- `src/team/typeChart.ts` — matriz de cobertura defensiva y ofensiva contra los 18 tipos.
- `src/team/redundancy.ts` — roles duplicados sin necesidad (dos Trick Room, dos Intimidate, **dos Mega Piedras en la misma alineación de 4**, tipo sobrerrepresentado...).
- `src/team/synergy.ts` — sinergias conocidas: clima/terreno + abusador, Trick Room + pegadores lentos, Follow Me/Rage Powder + setup, Intimidate vs. meta físico.
- `src/team/speedTiers.ts` — velocidad real del equipo vs. las amenazas top del meta, en neutral y bajo Trick Room.
- `src/team/optimizer.ts` — Stat Points (SP)/naturaleza/objeto sugeridos **por miembro, en el contexto de ESE equipo** (no una plantilla genérica: si ya hay Trick Room en el equipo, ajusta velocidad hacia abajo; si no hay control de velocidad propio, prioriza velocidad), con justificación breve.
- `src/team/suggest.ts` — sugiere el 6to (o siguiente) pokémon dado un núcleo de 4-5, rankeado por cobertura de tipos ganada + sinergias nuevas + relevancia en el meta.

### Los EVs ahora son "Stat Points" (SP) — importante

Pokémon Champions eliminó las IVs (siempre valen 31) y reemplazó los EVs 0-252 por **Stat Points (SP): 0 a 32 por stat, máximo 66 en total**, con una fórmula **lineal** (cada SP suma 1 punto de stat directo, sin el "entre 4" ni los rendimientos decrecientes de los juegos principales — fórmula real tomada del mod `champions`: `HP = base + SP + 75`, `otro = (base + SP + 20) × 1.1/0.9/1` según naturaleza). Esto cambia la estrategia óptima: en vez de buscar breakpoints en incrementos de a 4, lo que más rinde es llevar 1-2 stats clave al tope (32) y volcar el resto en otro stat. El optimizador y los reportes ya reflejan esto — no son los EVs clásicos reescalados.

## 4. Informe de salida

`src/report/markdown.ts` (`vgc report`) genera un Markdown por equipo: equipo, legalidad, matriz de tipos, redundancias, sinergias, speed tiers, SP sugeridos, sugerencia de siguiente miembro, win rate contra equipos sintéticos del top del meta, amenazas sin respuesta y sugerencias de mejora.

## Comandos

```bash
npm run cli -- formats
npm run cli -- sim battle -1 examples/team-balance-core.txt -2 examples/team-rain-weather.txt
npm run cli -- sim montecarlo -1 examples/team-balance-core.txt -2 examples/team-rain-weather.txt -n 50
npm run cli -- sim gauntlet -t examples/team-balance-core.txt -n 20 --teams 6
npm run cli -- meta update
npm run cli -- meta top -n 17
npm run cli -- team analyze -t examples/team-balance-core.txt
npm run cli -- team suggest -t examples/team-balance-core.txt
npm run cli -- report -t examples/team-balance-core.txt -o report.md
```

Los equipos se pasan como archivos de texto en formato de exportación de Showdown (`examples/*.txt` son equipos de 6 pokémon legales en Reg M-B, uno de ellos con Mega Evolución). Para Mega Evolución: el equipo lleva la especie base sosteniendo la Mega Piedra (p.ej. `Metagross @ Metagrossite`) — la Mega Evolución ocurre automáticamente en combate, no se declara como especie aparte.

## Equipos "sintéticos" del meta

Los rivales usados en `sim gauntlet` / `report` no son equipos copiados de un jugador puntual: se arman a partir de los datos reales de uso (o el dataset semilla) siguiendo el grafo de "compañeros de equipo" (% Teammates) de cada pokémon top, evitando choques de Item Clause y resolviendo formas Mega a su especie base + Mega Piedra. Es una reconstrucción razonable pensada para medir matchups contra el meta, documentada como tal en cada informe.

## Estructura

```
src/
  data/     acceso mod-aware a pokemon-showdown (Dex.forFormat) y formatos
  sim/      equipos, combate único, Monte Carlo, gauntlet vs. meta
  meta/     stats de Smogon, dataset semilla, cache local, roles, core meta
  team/     matriz de tipos, redundancias, sinergias, speed tiers, SP, sugerencia de 6to
  report/   generador de informe Markdown
  cli/      CLI (commander)
  test/     smoke test de punta a punta (`npm test`)
```

## Próximos pasos posibles

- Web UI sobre el mismo motor (todas las funciones son módulos TS puros, sin acoplamiento a la CLI).
- SQLite en vez de JSON para el cache de meta si el dataset crece mucho.
- Afinar el optimizador de SP con cálculo de daño real (no solo heurísticas de rol).
