/**
 * Validación de cifras para el nodo Code de n8n.
 *
 * Una nota de prensa municipal con una cifra inventada es un incidente
 * político, no un fallo de software. Este nodo compara toda cifra del texto
 * generado contra el documento fuente y marca las que no aparecen, antes de
 * que la pieza llegue al revisor.
 *
 * No sustituye a la revisión humana: la hace más rápida, señalando dónde mirar.
 *
 * Trabaja con formato numérico español: 1.250.000 (miles con punto),
 * 3,5 (decimales con coma) y magnitudes escritas ("2,4 millones").
 *
 * Probar:  node validar-cifras.js
 */

// Palabras que multiplican la cifra que las precede.
const MAGNITUDES = [
  { patron: /^mill(?:ón|ones)/i, factor: 1e6 },
  { patron: /^mil\b/i, factor: 1e3 },
];

// "el 12 de febrero": el día es metadato de la nota, no un dato tomado del
// acta, así que avisar sobre él sólo genera ruido.
const DIA_DE_MES =
  /^de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;

/**
 * Convierte un token numérico español a número.
 * Devuelve null si no se puede interpretar.
 */
function aNumero(token) {
  const limpio = token.replace(/\s/g, "");

  // 1.250.000 o 1.250.000,50 → miles con punto, decimales con coma
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(limpio)) {
    return parseFloat(limpio.replace(/\./g, "").replace(",", "."));
  }
  // 3,5 → decimal con coma
  if (/^\d+,\d+$/.test(limpio)) {
    return parseFloat(limpio.replace(",", "."));
  }
  // 1.500 → en castellano son miles, no un decimal
  if (/^\d+\.\d{3}$/.test(limpio)) {
    return parseFloat(limpio.replace(".", ""));
  }
  // 3.5 → decimal con punto (poco habitual en textos en español)
  if (/^\d+\.\d{1,2}$/.test(limpio)) {
    return parseFloat(limpio);
  }
  if (/^\d+$/.test(limpio)) {
    return parseFloat(limpio);
  }
  return null;
}

/**
 * Extrae las cifras de un texto, aplicando las magnitudes que las siguen.
 * Devuelve [{ token, valor, contexto }].
 */
function extraerCifras(texto) {
  const cifras = [];
  const regex = /\d[\d.,]*\d|\d/g;
  let coincidencia;

  while ((coincidencia = regex.exec(texto)) !== null) {
    // Descarta el token si va pegado a una letra o a un guion: códigos de
    // expediente, referencias tipo "2024/CT-18" o "artículo 3.b".
    const anterior = texto[coincidencia.index - 1] || " ";
    if (/[\wº/-]/.test(anterior)) continue;

    let token = coincidencia[0].replace(/[.,]$/, "");
    const valorBase = aNumero(token);
    if (valorBase === null) continue;

    // ¿Le sigue una magnitud? "2,4 millones" → 2400000
    const cola = texto.slice(coincidencia.index + coincidencia[0].length).trimStart();
    let valor = valorBase;
    let magnitud = "";
    for (const { patron, factor } of MAGNITUDES) {
      if (patron.test(cola)) {
        valor = valorBase * factor;
        magnitud = cola.match(patron)[0];
        break;
      }
    }

    const desde = Math.max(0, coincidencia.index - 45);
    const hasta = Math.min(texto.length, coincidencia.index + coincidencia[0].length + 45);

    cifras.push({
      token: magnitud ? `${token} ${magnitud}` : token,
      valor,
      esDiaDeMes:
        Number.isInteger(valorBase) &&
        valorBase >= 1 &&
        valorBase <= 31 &&
        DIA_DE_MES.test(cola),
      contexto: texto.slice(desde, hasta).replace(/\s+/g, " ").trim(),
    });
  }
  return cifras;
}

/**
 * Conjunto de valores numéricos presentes en el documento fuente,
 * incluidas las expansiones de magnitudes.
 */
function valoresDeFuente(fuente) {
  const valores = new Set();
  for (const { valor } of extraerCifras(fuente)) {
    valores.add(valor);
  }
  return valores;
}

/**
 * Compara el texto generado contra la fuente.
 *
 * @param {string} generado - Texto producido por el modelo.
 * @param {string} fuente   - Texto literal del acta que lo respalda.
 * @returns {{ok: boolean, noVerificadas: Array, aviso: string}}
 */
function validarCifras(generado, fuente) {
  const valoresFuente = valoresDeFuente(fuente);
  const fuenteNormalizada = fuente.replace(/\s+/g, " ");
  const noVerificadas = [];
  const yaAvisadas = new Set();

  for (const cifra of extraerCifras(generado)) {
    // Un año reciente casi nunca es un dato inventado y genera mucho ruido.
    if (Number.isInteger(cifra.valor) && cifra.valor >= 1900 && cifra.valor <= 2100) {
      continue;
    }
    // Día de una fecha: "el 12 de febrero".
    if (cifra.esDiaDeMes) continue;
    if (valoresFuente.has(cifra.valor)) continue;
    // Última oportunidad: el token literal aparece en la fuente.
    if (fuenteNormalizada.includes(cifra.token)) continue;
    if (yaAvisadas.has(cifra.valor)) continue;

    yaAvisadas.add(cifra.valor);
    noVerificadas.push(cifra);
  }

  const ok = noVerificadas.length === 0;
  const aviso = ok
    ? ""
    : "Cifras que NO aparecen en el documento fuente — comprobar antes de aprobar:\n" +
      noVerificadas
        .map((c) => `  • ${c.token}  →  «…${c.contexto}…»`)
        .join("\n");

  return { ok, noVerificadas, aviso };
}

// --- Nodo Code de n8n -------------------------------------------------------
// Modo "Run Once for Each Item". Espera que el item traiga `contenido` y
// `fragmento_fuente`, y les añade el resultado de la validación.
//
//   const { validarCifras } = ...  // pegar este fichero completo arriba
//   const r = validarCifras($json.contenido, $json.fragmento_fuente);
//   return { json: { ...$json, validacion_ok: r.ok, aviso_validacion: r.aviso } };

// --- Autocomprobación -------------------------------------------------------
// `node validar-cifras.js` ejecuta estos casos. Si se toca la lógica, esto
// avisa antes de subir el cambio a n8n.
// Fragmento de acta y nota derivada, con la densidad de cifras que tiene un
// caso real: el peligro de este validador no es fallar un caso raro, es dar
// tantos avisos falsos que el gabinete deje de leerlos.
const ACTA_EJEMPLO = `PUNTO 4.- APROBACIÓN INICIAL DEL PRESUPUESTO GENERAL 2026.
Por la Sra. Interventora se da cuenta del expediente 2025/PRES-004. El presupuesto
general para el ejercicio 2026 asciende a 78.450.000 euros, lo que supone un
incremento del 4,2 % respecto al ejercicio anterior. Se destinan 12.300.000 euros
al área de Servicios Sociales y 6 millones de euros a inversiones en el casco
histórico. Sometido a votación, se aprueba por 14 votos a favor, 8 en contra y
3 abstenciones. La exposición pública será de 15 días hábiles.`;

const NOTA_EJEMPLO = `El Ayuntamiento de Sanlúcar de Barrameda aprobó el Presupuesto
General para el ejercicio 2026, que asciende a 78.450.000 euros, un 4,2 % más que el
año anterior. El documento destina 12.300.000 euros a Servicios Sociales y 6 millones
de euros a inversiones en el casco histórico. La propuesta salió adelante con 14 votos
a favor, 8 en contra y 3 abstenciones, y se somete ahora a exposición pública durante
15 días hábiles.`;

function autocomprobacion() {
  const casos = [
    {
      nombre: "cifra correcta, formato idéntico",
      fuente: "Se aprueba una partida de 1.250.000 euros para el paseo marítimo.",
      generado: "El Pleno aprobó 1.250.000 euros destinados al paseo marítimo.",
      esperado: [],
    },
    {
      nombre: "cifra inventada",
      fuente: "Se aprueba una partida de 1.250.000 euros para el paseo marítimo.",
      generado: "El Pleno aprobó 1.500.000 euros para el paseo marítimo.",
      esperado: ["1.500.000"],
    },
    {
      nombre: "magnitud escrita equivalente a la fuente",
      fuente: "Una inversión de 2.400.000 euros en alumbrado.",
      generado: "Una inversión de 2,4 millones de euros en alumbrado.",
      esperado: [],
    },
    {
      nombre: "porcentaje con decimales correcto",
      fuente: "El presupuesto crece un 3,5 % respecto al ejercicio anterior.",
      generado: "El presupuesto sube un 3,5 % frente al año pasado.",
      esperado: [],
    },
    {
      nombre: "porcentaje alterado",
      fuente: "El presupuesto crece un 3,5 % respecto al ejercicio anterior.",
      generado: "El presupuesto sube un 4,5 % frente al año pasado.",
      esperado: ["4,5"],
    },
    {
      nombre: "los años no generan ruido",
      fuente: "Acta de la sesión ordinaria celebrada el 12 de marzo.",
      generado: "En el ejercicio 2026 el Ayuntamiento continuará el proyecto.",
      esperado: [],
    },
    {
      nombre: "números pequeños también se comprueban",
      fuente: "Se aprueba la creación de 3 nuevas plazas de personal laboral.",
      generado: "Se crearán 12 nuevas plazas de personal laboral.",
      esperado: ["12"],
    },
    {
      nombre: "referencias de expediente no cuentan como cifras",
      fuente: "Expediente 2024/CT-18 de contratación.",
      generado: "Según el expediente 2024/CT-18, se adjudica el contrato.",
      esperado: [],
    },
    {
      nombre: "varias cifras, sólo una inventada",
      fuente: "Se destinan 500.000 euros a 4 colegios del municipio.",
      generado: "Se destinan 500.000 euros a 7 colegios del municipio.",
      esperado: ["7"],
    },
    {
      nombre: "el día de una fecha no genera ruido",
      fuente: "Se aprueba por unanimidad la modificación de la ordenanza.",
      generado:
        "El pleno celebrado el 12 de febrero aprobó por unanimidad la ordenanza.",
      esperado: [],
    },
    {
      nombre: "nota realista fiel al acta: ningún aviso",
      fuente: ACTA_EJEMPLO,
      generado: NOTA_EJEMPLO,
      esperado: [],
    },
    {
      nombre: "nota realista con dos cifras alteradas",
      fuente: ACTA_EJEMPLO,
      generado: NOTA_EJEMPLO.replace("78.450.000", "87.450.000").replace(
        "14 votos",
        "16 votos"
      ),
      esperado: ["87.450.000", "16"],
    },
  ];

  let fallos = 0;
  for (const caso of casos) {
    const r = validarCifras(caso.generado, caso.fuente);
    const obtenido = r.noVerificadas.map((c) => c.token);
    const coincide =
      obtenido.length === caso.esperado.length &&
      obtenido.every((t, i) => t === caso.esperado[i]);

    if (coincide) {
      console.log(`  ok   ${caso.nombre}`);
    } else {
      fallos++;
      console.log(`  FALLA ${caso.nombre}`);
      console.log(`        esperaba: [${caso.esperado.join(", ")}]`);
      console.log(`        obtuvo:   [${obtenido.join(", ")}]`);
    }
  }

  console.log(`\n${casos.length - fallos}/${casos.length} casos correctos.`);
  return fallos;
}

if (typeof require !== "undefined" && require.main === module) {
  process.exit(autocomprobacion() === 0 ? 0 : 1);
}

if (typeof module !== "undefined") {
  module.exports = { validarCifras, extraerCifras, aNumero };
}
