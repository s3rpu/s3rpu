#!/usr/bin/env python3
"""Crea la base plantilla de Baserow a partir de scripts/esquema.yml.

Se ejecuta una vez por ayuntamiento nuevo: crea el workspace, la base y las
siete tablas con sus campos. Después basta con rellenar `config` y `ejemplos`.

Uso:
    export BASEROW_URL=http://localhost:8080
    export BASEROW_EMAIL=admin@ejemplo.es
    export BASEROW_PASSWORD='...'
    python3 crear_base_plantilla.py --workspace "Sanlúcar de Barrameda"

    # Ver qué haría, sin tocar nada:
    python3 crear_base_plantilla.py --workspace "Sanlúcar" --simulacion

El script es ruidoso a propósito: si la API responde algo inesperado, para y
enseña el cuerpo de la respuesta en vez de seguir dejando la base a medias.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import requests
import yaml

ESQUEMA = Path(__file__).parent / "esquema.yml"
TIEMPO_ESPERA = 30

# Traducción de los tipos del esquema a los de Baserow.
TIPOS: dict[str, dict[str, Any]] = {
    "texto": {"type": "text"},
    "texto_largo": {"type": "long_text"},
    "numero": {"type": "number", "number_decimal_places": 0},
    "si_no": {"type": "boolean"},
    "fecha": {"type": "date", "date_format": "EU", "date_include_time": False},
    "fecha_hora": {"type": "date", "date_format": "EU", "date_include_time": True},
    "email": {"type": "email"},
    "url": {"type": "url"},
    "fichero": {"type": "file"},
    "creado_en": {"type": "created_on"},
    # "opcion" y "enlace" se construyen aparte: necesitan datos del esquema.
}

# Colores que Baserow acepta para las opciones de un desplegable.
COLORES = ["light-blue", "light-green", "light-orange", "light-red", "light-gray"]


class ErrorBaserow(RuntimeError):
    pass


class Baserow:
    """Cliente mínimo de la API de Baserow."""

    def __init__(self, url: str, simulacion: bool = False):
        self.url = url.rstrip("/")
        self.simulacion = simulacion
        self.token: str | None = None
        self.sesion = requests.Session()

    # -- infraestructura ---------------------------------------------------

    def _cabeceras(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"JWT {self.token}"}

    def _peticion(self, metodo: str, ruta: str, **kwargs: Any) -> Any:
        if self.simulacion:
            if metodo == "GET":
                # En simulación no hay nada que leer: se comporta como una
                # instalación limpia, sin campos ni filas previas.
                return None
            cuerpo = json.dumps(kwargs.get("json", {}), ensure_ascii=False)
            print(f"    [simulación] {metodo} {ruta} {cuerpo[:130]}")
            return {"id": 0, "simulacion": True}

        respuesta = self.sesion.request(
            metodo,
            f"{self.url}{ruta}",
            headers=self._cabeceras(),
            timeout=TIEMPO_ESPERA,
            **kwargs,
        )
        if respuesta.status_code >= 400:
            raise ErrorBaserow(
                f"{metodo} {ruta} devolvió {respuesta.status_code}\n"
                f"  Petición: {json.dumps(kwargs.get('json', {}), ensure_ascii=False)}\n"
                f"  Respuesta: {respuesta.text[:600]}"
            )
        if respuesta.status_code == 204 or not respuesta.content:
            return None
        return respuesta.json()

    # -- autenticación -----------------------------------------------------

    def autenticar(self, email: str, password: str) -> None:
        datos = self._peticion(
            "POST", "/api/user/token-auth/", json={"email": email, "password": password}
        )
        # Baserow ha usado 'token' y 'access_token' según la versión.
        self.token = datos.get("access_token") or datos.get("token")
        if not self.token:
            raise ErrorBaserow(
                f"No se encontró el token en la respuesta de login: {list(datos)}"
            )

    # -- workspaces y bases ------------------------------------------------

    def crear_workspace(self, nombre: str) -> int:
        # /api/workspaces/ es lo actual; /api/groups/ es el nombre antiguo.
        for ruta in ("/api/workspaces/", "/api/groups/"):
            try:
                return self._peticion("POST", ruta, json={"name": nombre})["id"]
            except ErrorBaserow as e:
                if "404" not in str(e):
                    raise
        raise ErrorBaserow("Ni /api/workspaces/ ni /api/groups/ respondieron")

    def crear_base(self, workspace_id: int, nombre: str) -> int:
        for ruta in (
            f"/api/applications/workspace/{workspace_id}/",
            f"/api/applications/group/{workspace_id}/",
        ):
            try:
                return self._peticion(
                    "POST", ruta, json={"name": nombre, "type": "database"}
                )["id"]
            except ErrorBaserow as e:
                if "404" not in str(e):
                    raise
        raise ErrorBaserow("No se pudo crear la base en el workspace")

    # -- tablas, campos y filas -------------------------------------------

    def crear_tabla(self, base_id: int, nombre: str) -> int:
        return self._peticion(
            "POST", f"/api/database/tables/database/{base_id}/", json={"name": nombre}
        )["id"]

    def campos(self, tabla_id: int) -> list[dict[str, Any]]:
        return self._peticion("GET", f"/api/database/fields/table/{tabla_id}/") or []

    def crear_campo(self, tabla_id: int, cuerpo: dict[str, Any]) -> int:
        return self._peticion(
            "POST", f"/api/database/fields/table/{tabla_id}/", json=cuerpo
        )["id"]

    def actualizar_campo(self, campo_id: int, cuerpo: dict[str, Any]) -> None:
        self._peticion("PATCH", f"/api/database/fields/{campo_id}/", json=cuerpo)

    def borrar_campo(self, campo_id: int) -> None:
        self._peticion("DELETE", f"/api/database/fields/{campo_id}/")

    def filas(self, tabla_id: int) -> list[dict[str, Any]]:
        datos = self._peticion("GET", f"/api/database/rows/table/{tabla_id}/?size=200")
        return (datos or {}).get("results", [])

    def borrar_filas(self, tabla_id: int, ids: list[int]) -> None:
        if not ids:
            return
        self._peticion(
            "POST",
            f"/api/database/rows/table/{tabla_id}/batch-delete/",
            json={"items": ids},
        )


def cuerpo_campo(campo: dict[str, Any], tablas: dict[str, int]) -> dict[str, Any]:
    """Traduce un campo del esquema al cuerpo que espera la API de Baserow."""
    tipo = campo["tipo"]
    cuerpo: dict[str, Any] = {"name": campo["nombre"]}

    if tipo == "opcion":
        cuerpo["type"] = "single_select"
        cuerpo["select_options"] = [
            {"value": opcion, "color": COLORES[i % len(COLORES)]}
            for i, opcion in enumerate(campo["opciones"])
        ]
    elif tipo == "enlace":
        destino = campo["tabla"]
        if destino not in tablas:
            raise ErrorBaserow(
                f"El campo '{campo['nombre']}' enlaza a la tabla '{destino}', "
                "que no existe en el esquema"
            )
        cuerpo["type"] = "link_row"
        cuerpo["link_row_table_id"] = tablas[destino]
    elif tipo in TIPOS:
        cuerpo.update(TIPOS[tipo])
    else:
        raise ErrorBaserow(f"Tipo desconocido en el esquema: '{tipo}'")

    if campo.get("ayuda"):
        cuerpo["description"] = campo["ayuda"]
    return cuerpo


def aplicar(cliente: Baserow, esquema: dict[str, Any], workspace: str) -> None:
    print(f"→ Creando workspace «{workspace}»")
    workspace_id = cliente.crear_workspace(workspace)

    nombre_base = esquema.get("base", "Comunicación institucional")
    print(f"→ Creando base «{nombre_base}»")
    base_id = cliente.crear_base(workspace_id, nombre_base)

    # Primera pasada: crear todas las tablas vacías, para que los campos de
    # tipo enlace puedan apuntar a tablas que aún no tendrían id.
    tablas: dict[str, int] = {}
    for nombre in esquema["tablas"]:
        print(f"→ Creando tabla «{nombre}»")
        tablas[nombre] = cliente.crear_tabla(base_id, nombre)

    # Segunda pasada: campos.
    for nombre, definicion in esquema["tablas"].items():
        tabla_id = tablas[nombre]
        campos_esquema = definicion["campos"]
        print(f"→ Campos de «{nombre}» ({len(campos_esquema)})")

        existentes = cliente.campos(tabla_id)
        principal = next((c for c in existentes if c.get("primary")), None)

        # El campo principal no se puede borrar: se reconvierte en el primero
        # del esquema. El resto de campos por defecto sí se borran.
        primero, resto = campos_esquema[0], campos_esquema[1:]
        if principal:
            cliente.actualizar_campo(
                principal["id"], cuerpo_campo(primero, tablas)
            )
        else:
            cliente.crear_campo(tabla_id, cuerpo_campo(primero, tablas))

        for campo in existentes:
            if not campo.get("primary"):
                cliente.borrar_campo(campo["id"])

        for campo in resto:
            cliente.crear_campo(tabla_id, cuerpo_campo(campo, tablas))

        # Baserow crea filas vacías de ejemplo al crear la tabla.
        ids = [f["id"] for f in cliente.filas(tabla_id)]
        if ids:
            print(f"   limpiando {len(ids)} filas de ejemplo")
            cliente.borrar_filas(tabla_id, ids)

    print()
    print(f"Listo. Base creada en el workspace «{workspace}».")
    print("Siguientes pasos:")
    print("  1. Rellenar la única fila de `config`.")
    print("  2. Subir 5-10 notas de prensa reales a `ejemplos`.")
    print("  3. Dar de alta las cuentas del gabinete en el workspace.")


def comprobar_esquema(esquema: dict[str, Any]) -> list[str]:
    """Valida el esquema sin tocar la red. Devuelve la lista de errores."""
    errores: list[str] = []
    tablas = esquema.get("tablas", {})
    if not tablas:
        return ["El esquema no define ninguna tabla"]

    for nombre, definicion in tablas.items():
        campos = definicion.get("campos") or []
        if not campos:
            errores.append(f"La tabla '{nombre}' no tiene campos")
            continue

        vistos: set[str] = set()
        for campo in campos:
            etiqueta = f"{nombre}.{campo.get('nombre', '?')}"
            if "nombre" not in campo or "tipo" not in campo:
                errores.append(f"{etiqueta}: faltan 'nombre' o 'tipo'")
                continue
            if campo["nombre"] in vistos:
                errores.append(f"{etiqueta}: nombre de campo repetido")
            vistos.add(campo["nombre"])

            tipo = campo["tipo"]
            if tipo == "opcion":
                if not campo.get("opciones"):
                    errores.append(f"{etiqueta}: tipo 'opcion' sin lista de 'opciones'")
            elif tipo == "enlace":
                destino = campo.get("tabla")
                if not destino:
                    errores.append(f"{etiqueta}: tipo 'enlace' sin 'tabla' destino")
                elif destino not in tablas:
                    errores.append(
                        f"{etiqueta}: enlaza a la tabla '{destino}', que no existe"
                    )
            elif tipo not in TIPOS:
                errores.append(f"{etiqueta}: tipo desconocido '{tipo}'")

        # El campo principal de Baserow no admite estos tipos.
        principal = campos[0]
        if principal.get("tipo") in {"enlace", "fichero", "creado_en", "si_no"}:
            errores.append(
                f"{nombre}.{principal['nombre']}: el primer campo es el principal "
                f"de Baserow y no puede ser de tipo '{principal['tipo']}'"
            )

    return errores


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Nombre del workspace a crear")
    parser.add_argument(
        "--simulacion",
        action="store_true",
        help="No escribe nada: enseña las llamadas que haría",
    )
    parser.add_argument(
        "--solo-validar",
        action="store_true",
        help="Comprueba el esquema y sale, sin conectarse a Baserow",
    )
    args = parser.parse_args()

    esquema = yaml.safe_load(ESQUEMA.read_text(encoding="utf-8"))

    errores = comprobar_esquema(esquema)
    if errores:
        print("El esquema tiene errores:", file=sys.stderr)
        for error in errores:
            print(f"  - {error}", file=sys.stderr)
        return 1

    total = sum(len(t["campos"]) for t in esquema["tablas"].values())
    print(f"Esquema válido: {len(esquema['tablas'])} tablas, {total} campos.")
    if args.solo_validar:
        return 0

    if not args.workspace:
        print("Falta --workspace (o usa --solo-validar).", file=sys.stderr)
        return 2

    url = os.environ.get("BASEROW_URL", "")
    email = os.environ.get("BASEROW_EMAIL", "")
    password = os.environ.get("BASEROW_PASSWORD", "")
    if not args.simulacion and not all([url, email, password]):
        print(
            "Faltan variables de entorno: BASEROW_URL, BASEROW_EMAIL, BASEROW_PASSWORD",
            file=sys.stderr,
        )
        return 2

    cliente = Baserow(url, simulacion=args.simulacion)
    try:
        if not args.simulacion:
            cliente.autenticar(email, password)
        aplicar(cliente, esquema, args.workspace)
    except ErrorBaserow as e:
        print(f"\nError de Baserow:\n{e}", file=sys.stderr)
        return 1
    except requests.RequestException as e:
        print(f"\nNo se pudo conectar con Baserow en {url}: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
