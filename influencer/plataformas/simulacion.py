"""Publicador de simulación: escribe a disco en vez de a una red.

Sirve para ver el workflow completo funcionando sin credenciales, y como
destino de `--simular` para cualquier otra plataforma.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from ..modelos import Publicacion, ResultadoPublicacion
from ..util import a_iso, ahora, slug
from .base import Publicador


class Simulacion(Publicador):
    clave = "simulacion"
    requiere = ()

    def __init__(self, plataforma, carpeta: str = "salida"):
        super().__init__(plataforma)
        self.carpeta = Path(self.credenciales.get("carpeta") or carpeta)

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        self.carpeta.mkdir(parents=True, exist_ok=True)
        marca = (publicacion.programada_en or a_iso(ahora()))[:16].replace(":", "")
        nombre = f"{marca}-{slug(publicacion.plataforma, 20)}-{slug(publicacion.titulo, 40)}.md"
        destino = self.carpeta / nombre
        destino.write_text(self._markdown(publicacion), encoding="utf-8")
        huella = hashlib.sha1(destino.name.encode()).hexdigest()[:12]
        return ResultadoPublicacion(
            ok=True, externa_id=f"sim_{huella}", url=destino.resolve().as_uri()
        )

    def _markdown(self, p: Publicacion) -> str:
        lineas = [
            f"# {p.titulo or 'Publicación'}",
            "",
            f"- Plataforma: **{p.plataforma}**",
            f"- Formato: {p.formato}",
            f"- Programada: {p.programada_en}",
            f"- Generado por: {p.generado_por or 'desconocido'}",
            "",
            "## Texto",
            "",
            self.texto(p),
            "",
            "## Visual",
            "",
            p.visual or "—",
            "",
            f"*Texto alternativo:* {p.texto_alt or '—'}",
        ]
        return "\n".join(lineas) + "\n"
