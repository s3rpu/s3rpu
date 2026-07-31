# VGC Analyzer

Herramienta de análisis competitivo para Pokémon VGC (Reglamento vigente, Gen 9), en Node.js/TypeScript. CLI en `vgc`, motor de datos del meta, simulador de combates sobre el motor real de Pokémon Showdown (`@pkmn/sim`) y constructor de equipos con validación de sinergia.

## Instalación

```bash
cd vgc-analyzer
npm install
```

Todos los comandos se corren con `npm run cli -- <comando>` (usa `tsx`, no hace falta compilar), o `npm run build && node dist/cli/index.js <comando>` para el binario compilado.

## 1. Motor de datos del meta

- `src/data/dex.ts` / `src/data/formats.ts`: acceso tipado a especies, movimientos, objetos, habilidades, tipos y detección automática del Reglamento VGC vigente (el de mayor año/letra disponible en el `@pkmn/sim` instalado — `npm update @pkmn/sim` trae reglamentos nuevos sin tocar código).
- `src/meta/smogonStats.ts`: integración real con [Smogon Stats](https://www.smogon.com/stats/) (el mismo dato crudo — JSON "chaos" mensual por formato — que consumen Pikalytics y VGCPastes): uso, sets, objetos, EVs y % de compañeros de equipo.
- `src/meta/store.ts`: cache local en JSON (`data/meta-<formato>.json`) con timestamp de última actualización (`vgc meta update`).
- `src/meta/roles.ts` + `src/meta/metaEngine.ts`: clasifica el "core meta" (top N) por rol (clima, terreno, Trick Room, control de velocidad, redirección, Intimidate, pivote, setup, choice lock, soporte, tanque) y expone sus counters más comunes (Checks & Counters de Smogon).

**Nota sobre red:** este entorno de ejecución sandboxed bloquea la salida a `smogon.com`, así que `meta update` no puede alcanzarlo aquí y cae automáticamente a un **dataset semilla** curado a mano (`src/meta/seedData.ts`, ~24 pokémon representativos del meta Gen 9 VGC, marcado explícitamente `source: 'seed'`) para que el resto de la app funcione igual. En una máquina con salida de red normal (tu laptop, CI, otro entorno), `vgc meta update` trae datos reales de Smogon y los marca `source: 'live'`.

## 2. Simulador de combates

Sobre `@pkmn/sim` (motor real de Showdown: daño, IA vía `RandomPlayerAI`, objetos/habilidades tal como en el juego):

- `src/sim/battle.ts` — combate único entre equipo A y equipo B (`vgc sim battle`).
- `src/sim/monteCarlo.ts` — N combates con variabilidad real de IA/orden (ninguna semilla se fija), agrega win rate, líneas de juego más comunes, MVPs (supervivencia) y "quién muere primero" (`vgc sim montecarlo`).
- `src/sim/gauntlet.ts` — un equipo contra **todos** los equipos top del meta a la vez, no solo un rival (`vgc sim gauntlet`).

## 3. Constructor de equipos con validación de sinergia

- `src/team/typeChart.ts` — matriz de cobertura defensiva y ofensiva contra los 18 tipos.
- `src/team/redundancy.ts` — roles duplicados sin necesidad (dos Trick Room, dos Intimidate, tipo sobrerrepresentado...).
- `src/team/synergy.ts` — sinergias conocidas: clima/terreno + abusador, Trick Room + pegadores lentos, Follow Me/Rage Powder + setup, Intimidate vs. meta físico.
- `src/team/speedTiers.ts` — velocidad real (EVs/naturaleza/nivel) del equipo vs. las amenazas top del meta, en neutral y bajo Trick Room.
- `src/team/optimizer.ts` — EVs/naturaleza/objeto sugeridos **por miembro, en el contexto de ESE equipo** (no una plantilla genérica: si ya hay Trick Room en el equipo, ajusta velocidad hacia abajo; si no hay control de velocidad propio, prioriza velocidad), con justificación breve.
- `src/team/suggest.ts` — sugiere el 6to (o siguiente) pokémon dado un núcleo de 4-5, rankeado por cobertura de tipos ganada + sinergias nuevas + relevancia en el meta.

## 4. Informe de salida

`src/report/markdown.ts` (`vgc report`) genera un Markdown por equipo: equipo, legalidad, matriz de tipos, redundancias, sinergias, speed tiers, EVs sugeridos, sugerencia de siguiente miembro, win rate contra equipos sintéticos del top del meta, amenazas sin respuesta y sugerencias de mejora.

## Comandos

```bash
npm run cli -- formats
npm run cli -- sim battle -1 examples/team-flareon-core.txt -2 examples/team-rain-sun.txt
npm run cli -- sim montecarlo -1 examples/team-flareon-core.txt -2 examples/team-rain-sun.txt -n 50
npm run cli -- sim gauntlet -t examples/team-flareon-core.txt -n 20 --teams 6
npm run cli -- meta update
npm run cli -- meta top -n 25
npm run cli -- team analyze -t examples/team-flareon-core.txt
npm run cli -- team suggest -t examples/team-flareon-core.txt
npm run cli -- report -t examples/team-flareon-core.txt -o report.md
```

Los equipos se pasan como archivos de texto en formato de exportación de Showdown (`examples/*.txt` son ejemplos de 4 pokémon, formato Reg I).

## Equipos "sintéticos" del meta

Los rivales usados en `sim gauntlet` / `report` no son equipos copiados de un jugador puntual: se arman a partir de los datos reales de uso (o el dataset semilla) siguiendo el grafo de "compañeros de equipo" (% Teammates) de cada pokémon top, evitando choques de Item Clause. Es una reconstrucción razonable pensada para medir matchups contra el meta, documentada como tal en cada informe.

## Estructura

```
src/
  data/     acceso a @pkmn/dex, @pkmn/data y formatos
  sim/      equipos, combate único, Monte Carlo, gauntlet vs. meta
  meta/     stats de Smogon, dataset semilla, cache local, roles, core meta
  team/     matriz de tipos, redundancias, sinergias, speed tiers, EVs, sugerencia de 6to
  report/   generador de informe Markdown
  cli/      CLI (commander)
  test/     smoke test de punta a punta (`npm test`)
```

## Próximos pasos posibles

- Web UI sobre el mismo motor (todas las funciones son módulos TS puros, sin acoplamiento a la CLI).
- SQLite en vez de JSON para el cache de meta si el dataset crece mucho.
- Afinar el optimizador de EVs con cálculo de daño real (no solo heurísticas de rol) usando `@pkmn/data`'s damage calc.
