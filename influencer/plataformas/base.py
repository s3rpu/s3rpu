"""Contrato común de los publicadores."""

from __future__ import annotations

from typing import Any

from ..config import Plataforma
from ..modelos import Metrica, Publicacion, ResultadoPublicacion
from ..util import a_iso, ahora

TIEMPO_ESPERA = 30


class FaltanCredenciales(Exception):
    """Faltan claves obligatorias para operar con la red."""


class Publicador:
    #: nombre normalizado con el que se referencia en el YAML
    clave: str = ""
    #: claves obligatorias dentro de 'credenciales'
    requiere: tuple[str, ...] = ()
    #: si la red devuelve métricas de interacción
    con_metricas: bool = False

    def __init__(self, plataforma: Plataforma):
        self.plataforma = plataforma
        self.credenciales = {k: str(v).strip() for k, v in (plataforma.credenciales or {}).items()}

    # --------------------------------------------------------------- helpers

    def credencial(self, nombre: str) -> str:
        valor = self.credenciales.get(nombre, "")
        if not valor:
            raise FaltanCredenciales(
                f"Falta la credencial '{nombre}' para {self.plataforma.nombre}."
            )
        return valor

    def comprobar(self) -> list[str]:
        """Devuelve la lista de credenciales que faltan."""
        return [c for c in self.requiere if not self.credenciales.get(c)]

    def limite(self) -> int:
        return int(self.plataforma.especificacion()["limite"])

    def texto(self, publicacion: Publicacion) -> str:
        return publicacion.texto(self.limite())

    # ---------------------------------------------------------------- API

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        raise NotImplementedError

    def metricas(self, publicacion: Publicacion) -> Metrica | None:
        """Sobreescribir en las redes que exponen estadísticas."""
        return None

    # ------------------------------------------------------------- utilidad

    @staticmethod
    def _metrica(publicacion: Publicacion, **valores: Any) -> Metrica:
        return Metrica(
            publicacion_id=int(publicacion.id or 0),
            capturada_en=a_iso(ahora()),
            **{k: int(v or 0) for k, v in valores.items()},
        )


def pedir(metodo: str, url: str, **kwargs: Any):
    """Envoltura de requests con tiempo de espera y errores legibles."""
    import requests

    kwargs.setdefault("timeout", TIEMPO_ESPERA)
    respuesta = requests.request(metodo, url, **kwargs)
    if respuesta.status_code >= 400:
        detalle = respuesta.text[:400].replace("\n", " ")
        raise RuntimeError(f"HTTP {respuesta.status_code} en {url}: {detalle}")
    if not respuesta.content:
        return {}
    try:
        return respuesta.json()
    except ValueError:
        return {"texto": respuesta.text}
