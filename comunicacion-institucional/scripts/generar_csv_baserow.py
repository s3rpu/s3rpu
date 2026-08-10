#!/usr/bin/env python3
"""Genera un CSV por tabla a partir de esquema.yml, listo para importar en Baserow.

Existe porque crear 7 tablas y 67 campos a mano en la interfaz es un par de horas
de clics, y porque el cliente de la API (`crear_base_plantilla.py`) requiere
terminal. Importar un CSV es arrastrar un fichero: eso sí lo hace cualquiera.

Cada CSV lleva la fila de cabecera con los nombres de campo y una fila de ejemplo,
para que Baserow acuerte el tipo de cada columna al importar. La fila de ejemplo se
borra después desde la propia interfaz.

Los campos de tipo enlace y fichero no se pueden crear por CSV: se convierten a
mano después. El script los lista al final para que no se olviden.

    python3 generar_csv_baserow.py
"""

from __future__ import annotations

import csv
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parent.parent
ESQUEMA = RAIZ / "scripts" / "esquema.yml"
SALIDA = RAIZ / "datos" / "csv-baserow"

# Valores reales de Sanlúcar, extraídos de sus cinco notas de prensa.
# Ver datos/config-sanlucar.md.
CONFIG_SANLUCAR = {
    "clave": "sanlucar",
    "nombre_oficial": "Ayuntamiento de Sanlúcar de Barrameda",
    "gentilicio": "sanluqueño / sanluqueña",
    "cargo_alcaldia": "alcaldesa",
    "nombre_alcaldia": "Carmen Álvarez",
    "tratamientos": (
        "La institución es «el Ayuntamiento de Sanlúcar de Barrameda» o «el "
        "Ayuntamiento». También «el Gobierno local», con G mayúscula. Nunca «el "
        "consistorio».\n\n"
        "Los cargos van con el cargo delante y el nombre detrás, entre comas: «La "
        "alcaldesa, Carmen Álvarez, ha destacado…». En menciones posteriores, sólo "
        "el nombre.\n\n"
        "Cargos: Carmen Álvarez (alcaldesa); Narciso Vital (delegado de Cultura y "
        "Fiestas, y de Tráfico y Movilidad); Miguel Ángel Casal (delegado "
        "municipal).\n\n"
        "Empresas municipales: Emulisan (limpieza viaria), Tussa (transporte "
        "urbano).\n\n"
        "A la ciudadanía: «los sanluqueños y sanluqueñas», «la ciudadanía», «los "
        "vecinos y vecinas». El desdoblamiento es el uso habitual de la casa.\n\n"
        "La ciudad es «Sanlúcar». «Sanlúcar de Barrameda» sólo en la primera "
        "mención o en el nombre completo de la institución."
    ),
    "tono": (
        "Institucional y sobrio, en tercera persona y voz activa. Frases largas "
        "pero claras: es el registro de la casa, no telegramas.\n\n"
        "Pasado compuesto para lo hecho («ha llevado a cabo»), futuro para lo "
        "previsto («pondrá en marcha»).\n\n"
        "Los datos concretos van en el cuerpo: importes, horarios, fechas, "
        "recorridos, porcentajes. Notas informativas y densas en detalle práctico, "
        "no declarativas.\n\n"
        "Sin adjetivación propagandística. «Histórico» sólo si el dato lo es y está "
        "en la fuente."
    ),
    "lenguaje_inclusivo": "si",
    "hashtags": "",
    "perfil_x": "",
    "perfil_facebook": "",
    "perfil_instagram": "",
    "palabras_nota_prensa": "300",
    "caracteres_x": "270",
    "palabras_facebook": "90",
    "palabras_instagram": "60",
    "lista_brevo_id": "",
    "notas_adicionales": "",
}

# Fila de ejemplo por tabla, para que Baserow acierte el tipo de cada columna.
# Se borra desde la interfaz después de importar.
EJEMPLOS = {
    "fuentes": {
        "titulo": "BORRAR — Acta del pleno ordinario de enero",
        "tipo": "acta_pleno",
        "fecha_sesion": "2026-01-15",
        "estado": "pendiente",
        "paginas": "84",
        "error": "",
    },
    "puntos": {
        "titulo": "BORRAR — Aprobación inicial del presupuesto general",
        "orden": "4",
        "texto": "Texto literal del acuerdo tal y como figura en el acta.",
        "pagina": "12",
        "noticiable": "false",
        "generado": "false",
    },
    "piezas": {
        "identificador": "BORRAR — ejemplo",
        "canal": "nota_prensa",
        "contenido": "Texto de la pieza generada, editable por el gabinete.",
        "estado": "borrador",
        "fragmento_fuente": "Fragmento del documento que respalda la pieza.",
        "aviso_validacion": "",
        "validacion_ok": "true",
        "aprobado_por": "",
        "aprobado_en": "",
        "modelo": "claude-opus-5",
    },
    "contactos": {
        "nombre": "BORRAR — Nombre Apellido",
        "email": "ejemplo@medio.es",
        "medio": "Diario de Cádiz",
        "tipo": "prensa",
        "etiquetas": "local, provincial",
        "base_legal": "interes_legitimo",
        "fecha_consentimiento": "2026-01-01",
        "origen_consentimiento": "Contacto profesional publicado",
        "baja": "false",
        "fecha_baja": "",
    },
    "envios": {
        "identificador": "BORRAR — ejemplo",
        "segmento": "prensa local",
        "destinatarios": "24",
        "fecha": "2026-08-10 09:42",
        "estado": "enviado",
        "detalle": "",
    },
}

# Campos que el CSV no puede crear: hay que convertirlos a mano tras importar.
NO_IMPORTABLES = {"enlace", "fichero", "creado_en"}


def main() -> int:
    esquema = yaml.safe_load(ESQUEMA.read_text(encoding="utf-8"))
    SALIDA.mkdir(parents=True, exist_ok=True)

    pendientes: list[str] = []
    generados = 0

    for nombre, definicion in esquema["tablas"].items():
        # `ejemplos` ya viene poblada con las cinco notas reales del gabinete.
        if nombre == "ejemplos":
            continue

        campos = [c for c in definicion["campos"] if c["tipo"] not in NO_IMPORTABLES]
        cabeceras = [c["nombre"] for c in campos]

        for campo in definicion["campos"]:
            if campo["tipo"] in NO_IMPORTABLES:
                destino = f" → enlaza con «{campo['tabla']}»" if campo["tipo"] == "enlace" else ""
                pendientes.append(
                    f"{nombre}.{campo['nombre']}: crear a mano como «{campo['tipo']}»{destino}"
                )

        if nombre == "config":
            filas = [{k: CONFIG_SANLUCAR.get(k, "") for k in cabeceras}]
        else:
            ejemplo = EJEMPLOS.get(nombre, {})
            filas = [{k: ejemplo.get(k, "") for k in cabeceras}]

        destino = SALIDA / f"{nombre}.csv"
        with destino.open("w", newline="", encoding="utf-8-sig") as fh:
            escritor = csv.DictWriter(fh, fieldnames=cabeceras)
            escritor.writeheader()
            escritor.writerows(filas)

        generados += 1
        print(f"  {destino.name:<16} {len(cabeceras):>2} columnas")

    print(f"\n{generados} CSV generados en datos/csv-baserow/")
    print("Más ejemplos-sanlucar.csv, que ya existe con las cinco notas reales.\n")
    print("Campos a crear a mano después de importar:")
    for p in pendientes:
        print(f"  - {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
