"""Utilidades comunes: fechas, texto y slugs."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, timezone

DIAS = {
    "lun": 0,
    "mar": 1,
    "mie": 2,
    "jue": 3,
    "vie": 4,
    "sab": 5,
    "dom": 6,
}


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def a_iso(momento: datetime) -> str:
    """Serializa a ISO 8601 en UTC (siempre con zona)."""
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return momento.astimezone(timezone.utc).isoformat(timespec="seconds")


def de_iso(texto: str | None) -> datetime | None:
    if not texto:
        return None
    momento = datetime.fromisoformat(texto)
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return momento


def dia_a_indice(dia: str) -> int | None:
    """'lun' -> 0. Acepta también nombres largos y '*' (devuelve None)."""
    clave = normalizar(dia)[:3]
    if clave in ("*", "tod"):
        return None
    return DIAS.get(clave)


def normalizar(texto: str) -> str:
    """Minúsculas sin acentos, para comparar claves de configuración."""
    descompuesto = unicodedata.normalize("NFKD", texto.strip().lower())
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def slug(texto: str, largo: int = 60) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", normalizar(texto)).strip("-")
    return base[:largo] or "sin-titulo"


def recortar(texto: str, limite: int) -> str:
    """Recorta respetando palabras y añadiendo elipsis si hace falta."""
    texto = texto.strip()
    if limite <= 0 or len(texto) <= limite:
        return texto
    corte = texto[: limite - 1]
    espacio = corte.rfind(" ")
    if espacio > limite * 0.6:
        corte = corte[:espacio]
    return corte.rstrip(" ,.;:-") + "…"


def hashtag(texto: str) -> str:
    """Convierte 'entreno en casa' en '#entrenoencasa'."""
    limpio = re.sub(r"[^a-z0-9]+", "", normalizar(texto))
    return f"#{limpio}" if limpio else ""
