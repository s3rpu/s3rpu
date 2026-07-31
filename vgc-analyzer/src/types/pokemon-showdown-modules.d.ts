/**
 * El paquete `pokemon-showdown` no publica .d.ts para sus modulos de
 * "tools" (son utilidades de ejemplo/dev, no parte de su API tipada
 * publica), asi que declaramos el shape minimo que usamos.
 */
declare module 'pokemon-showdown/dist/sim/tools/random-player-ai.js' {
  interface RandomPlayerAIOptions {
    move?: number;
    mega?: number;
    seed?: unknown;
  }

  // El tipo exacto del stream (Streams.ObjectReadWriteStream<string>) no esta
  // en el .d.ts publico de `pokemon-showdown` (se re-exporta en runtime via
  // un mecanismo que el compilador no ve), asi que se tipa como `any` aca.
  class RandomPlayerAI {
    constructor(playerStream: any, options?: RandomPlayerAIOptions, debug?: boolean);
    start(): Promise<void>;
  }

  const _default: { RandomPlayerAI: typeof RandomPlayerAI };
  export default _default;
}
