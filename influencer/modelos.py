"""Modelos de dominio del workflow."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

# Estados de una idea
IDEA_PENDIENTE = "pendiente"
IDEA_USADA = "usada"
IDEA_DESCARTADA = "descartada"

# Estados de una publicación
BORRADOR = "borrador"      # tiene hueco en el calendario, falta el texto
LISTA = "lista"            # texto generado, esperando a su hora
PUBLICADA = "publicada"
FALLIDA = "fallida"        # se agotaron los reintentos


@dataclass
class Idea:
    titulo: str
    angulo: str = ""
    formato: str = "post"
    temas: list[str] = field(default_factory=list)
    gancho: str = ""
    estado: str = IDEA_PENDIENTE
    creada_en: str = ""
    id: int | None = None

    def dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Publicacion:
    plataforma: str
    programada_en: str
    idea_id: int | None = None
    formato: str = "post"
    titulo: str = ""
    gancho: str = ""
    cuerpo: str = ""
    cta: str = ""
    hashtags: list[str] = field(default_factory=list)
    visual: str = ""
    texto_alt: str = ""
    imagen_url: str = ""
    estado: str = BORRADOR
    generado_por: str = ""
    intentos: int = 0
    error: str = ""
    publicada_en: str = ""
    externa_id: str = ""
    url: str = ""
    id: int | None = None

    def texto(self, limite: int = 0) -> str:
        """Monta el texto final que se envía a la plataforma."""
        from .util import recortar

        bloques = [self.gancho, self.cuerpo, self.cta]
        cuerpo = "\n\n".join(b.strip() for b in bloques if b and b.strip())
        etiquetas = " ".join(self.hashtags).strip()
        if not limite:
            return "\n\n".join(p for p in (cuerpo, etiquetas) if p)
        # Las etiquetas ceden espacio antes que el mensaje.
        margen = limite - (len(etiquetas) + 2 if etiquetas else 0)
        if margen < limite * 0.5:
            etiquetas = ""
            margen = limite
        cuerpo = recortar(cuerpo, margen)
        return "\n\n".join(p for p in (cuerpo, etiquetas) if p)

    def dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Metrica:
    publicacion_id: int
    capturada_en: str
    impresiones: int = 0
    alcance: int = 0
    likes: int = 0
    comentarios: int = 0
    compartidos: int = 0
    guardados: int = 0
    clics: int = 0

    @property
    def interacciones(self) -> int:
        return self.likes + self.comentarios + self.compartidos + self.guardados

    def dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ResultadoPublicacion:
    ok: bool
    externa_id: str = ""
    url: str = ""
    error: str = ""
