"""Registro de publicadores disponibles."""

from __future__ import annotations

from ..config import Plataforma
from ..util import normalizar
from .base import FaltanCredenciales, Publicador
from .mensajeria import Discord, Telegram
from .simulacion import Simulacion
from .sociales import Instagram, LinkedIn, Mastodon, X

REGISTRO: dict[str, type[Publicador]] = {
    cls.clave: cls for cls in (Telegram, Discord, Mastodon, X, LinkedIn, Instagram, Simulacion)
}


class PlataformaDesconocida(Exception):
    pass


def crear(plataforma: Plataforma, salida: str = "salida", simular: bool = False) -> Publicador:
    """Instancia el publicador de una plataforma.

    Con ``simular=True`` se devuelve siempre el publicador de simulación, sin
    importar la red configurada.
    """
    if simular:
        return Simulacion(plataforma, carpeta=salida)
    clave = normalizar(plataforma.nombre)
    if clave == "simulacion":
        return Simulacion(plataforma, carpeta=salida)
    cls = REGISTRO.get(clave)
    if cls is None:
        raise PlataformaDesconocida(
            f"No hay publicador para '{plataforma.nombre}'. "
            f"Disponibles: {', '.join(sorted(REGISTRO))}."
        )
    return cls(plataforma)


__all__ = [
    "REGISTRO",
    "FaltanCredenciales",
    "PlataformaDesconocida",
    "Publicador",
    "crear",
]
