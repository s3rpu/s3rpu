"""Carga y validación del fichero de configuración (YAML)."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from .util import dia_a_indice, normalizar

RUTA_POR_DEFECTO = Path("influencer.yml")

# Límites y estilo por red. Se pueden pisar desde el YAML.
ESPECIFICACIONES: dict[str, dict[str, Any]] = {
    "x": {"limite": 275, "hashtags_max": 3, "estilo": "frases muy cortas, sin rodeos, una idea por línea"},
    "mastodon": {"limite": 480, "hashtags_max": 4, "estilo": "conversacional y directo, comunidad técnica"},
    "instagram": {"limite": 2100, "hashtags_max": 12, "estilo": "primera línea muy potente, párrafos de 1-2 frases"},
    "tiktok": {"limite": 2100, "hashtags_max": 8, "estilo": "guion hablado, ritmo rápido, gancho en 2 segundos"},
    "youtube": {"limite": 4800, "hashtags_max": 8, "estilo": "descripción con contexto y capítulos"},
    "linkedin": {"limite": 2800, "hashtags_max": 5, "estilo": "profesional pero humano, con aprendizaje concreto"},
    "telegram": {"limite": 3800, "hashtags_max": 5, "estilo": "cercano, como mensaje a un amigo"},
    "discord": {"limite": 1900, "hashtags_max": 5, "estilo": "informal, de comunidad, admite markdown"},
    "simulacion": {"limite": 3000, "hashtags_max": 8, "estilo": "neutro"},
}
ESPECIFICACION_GENERICA = {"limite": 2000, "hashtags_max": 8, "estilo": "claro y cercano"}

_VARIABLE = re.compile(r"\$\{([A-Z0-9_]+)\}")


class ErrorConfig(Exception):
    """Configuración ausente, incompleta o incoherente."""


def _expandir(valor: Any) -> Any:
    """Sustituye ${VAR} por variables de entorno (vacío si no existe)."""
    if isinstance(valor, str):
        return _VARIABLE.sub(lambda m: os.environ.get(m.group(1), ""), valor)
    if isinstance(valor, dict):
        return {k: _expandir(v) for k, v in valor.items()}
    if isinstance(valor, list):
        return [_expandir(v) for v in valor]
    return valor


@dataclass
class Persona:
    nombre: str = "Mi marca"
    nicho: str = "contenido general"
    audiencia: str = "público general"
    tono: str = "cercano y directo"
    idioma: str = "es"
    temas: list[str] = field(default_factory=list)
    evitar: list[str] = field(default_factory=list)
    cta_por_defecto: str = ""
    firma: str = ""


@dataclass
class Modelo:
    id: str = "claude-opus-5"
    esfuerzo: str = "medium"
    max_tokens: int = 8000


@dataclass
class Plataforma:
    nombre: str
    activa: bool = True
    formato: str = "post"
    credenciales: dict[str, str] = field(default_factory=dict)
    limite: int = 0
    hashtags_max: int = 0
    estilo: str = ""

    @property
    def clave(self) -> str:
        return normalizar(self.nombre)

    def especificacion(self) -> dict[str, Any]:
        base = dict(ESPECIFICACIONES.get(self.clave, ESPECIFICACION_GENERICA))
        if self.limite:
            base["limite"] = self.limite
        if self.hashtags_max:
            base["hashtags_max"] = self.hashtags_max
        if self.estilo:
            base["estilo"] = self.estilo
        base["nombre"] = self.nombre
        base["formato"] = self.formato
        return base


@dataclass
class Franja:
    """Una regla del calendario: qué días, a qué horas y en qué redes."""

    horas: list[str]
    dias: list[str] = field(default_factory=lambda: ["*"])
    plataformas: list[str] = field(default_factory=list)

    def indices_dias(self) -> set[int] | None:
        """None = todos los días."""
        indices: set[int] = set()
        for dia in self.dias:
            indice = dia_a_indice(dia)
            if indice is None:
                return None
            indices.add(indice)
        return indices or None


@dataclass
class Calendario:
    zona_horaria: str = "Europe/Madrid"
    dias_horizonte: int = 7
    franjas: list[Franja] = field(default_factory=list)


@dataclass
class Config:
    persona: Persona = field(default_factory=Persona)
    modelo: Modelo = field(default_factory=Modelo)
    plataformas: list[Plataforma] = field(default_factory=list)
    calendario: Calendario = field(default_factory=Calendario)
    ideas_minimas: int = 12
    reintentos: int = 3
    base_datos: str = "influencer.db"
    salida: str = "salida"
    ruta: Path | None = None

    def activas(self) -> list[Plataforma]:
        return [p for p in self.plataformas if p.activa]

    def plataforma(self, nombre: str) -> Plataforma | None:
        clave = normalizar(nombre)
        for p in self.plataformas:
            if p.clave == clave:
                return p
        return None


def cargar(ruta: str | Path | None = None) -> Config:
    ruta = Path(ruta or RUTA_POR_DEFECTO)
    if not ruta.exists():
        raise ErrorConfig(
            f"No encuentro '{ruta}'. Crea uno con: python -m influencer init"
        )
    datos = yaml.safe_load(ruta.read_text(encoding="utf-8")) or {}
    if not isinstance(datos, dict):
        raise ErrorConfig(f"'{ruta}' no contiene un mapa YAML válido.")
    return desde_dict(_expandir(datos), ruta)


def desde_dict(datos: dict[str, Any], ruta: Path | None = None) -> Config:
    cfg = Config(ruta=ruta)

    persona = datos.get("persona") or {}
    if not isinstance(persona, dict):
        raise ErrorConfig("'persona' debe ser un mapa.")
    cfg.persona = Persona(**{k: v for k, v in persona.items() if k in Persona.__annotations__})

    modelo = datos.get("modelo") or {}
    cfg.modelo = Modelo(**{k: v for k, v in modelo.items() if k in Modelo.__annotations__})

    plataformas = datos.get("plataformas") or []
    if not isinstance(plataformas, list) or not plataformas:
        raise ErrorConfig("Define al menos una entrada en 'plataformas'.")
    for entrada in plataformas:
        if isinstance(entrada, str):
            entrada = {"nombre": entrada}
        if not isinstance(entrada, dict) or not entrada.get("nombre"):
            raise ErrorConfig(f"Plataforma inválida: {entrada!r} (falta 'nombre').")
        cfg.plataformas.append(
            Plataforma(**{k: v for k, v in entrada.items() if k in Plataforma.__annotations__})
        )

    calendario = datos.get("calendario") or {}
    franjas = []
    for entrada in calendario.get("franjas") or []:
        horas = entrada.get("horas") or ([entrada["hora"]] if entrada.get("hora") else [])
        if not horas:
            raise ErrorConfig("Cada franja necesita 'horas' (o 'hora').")
        for hora in horas:
            _validar_hora(hora)
        franjas.append(
            Franja(
                horas=list(horas),
                dias=list(entrada.get("dias") or ["*"]),
                plataformas=list(entrada.get("plataformas") or []),
            )
        )
    if not franjas:
        raise ErrorConfig("El 'calendario' necesita al menos una franja.")
    cfg.calendario = Calendario(
        zona_horaria=calendario.get("zona_horaria", "Europe/Madrid"),
        dias_horizonte=int(calendario.get("dias_horizonte", 7)),
        franjas=franjas,
    )

    cfg.ideas_minimas = int(datos.get("ideas_minimas", cfg.ideas_minimas))
    cfg.reintentos = int(datos.get("reintentos", cfg.reintentos))
    cfg.base_datos = datos.get("base_datos", cfg.base_datos)
    cfg.salida = datos.get("salida", cfg.salida)

    _validar_referencias(cfg)
    return cfg


def _validar_hora(hora: str) -> None:
    if not re.fullmatch(r"[0-2]?\d:[0-5]\d", str(hora)):
        raise ErrorConfig(f"Hora inválida en el calendario: {hora!r} (usa 'HH:MM').")
    h, m = (int(x) for x in str(hora).split(":"))
    if h > 23:
        raise ErrorConfig(f"Hora inválida en el calendario: {hora!r}.")


def _validar_referencias(cfg: Config) -> None:
    conocidas = {p.clave for p in cfg.plataformas}
    for franja in cfg.calendario.franjas:
        for nombre in franja.plataformas:
            if normalizar(nombre) not in conocidas:
                raise ErrorConfig(
                    f"La franja usa la plataforma '{nombre}', que no está en 'plataformas'."
                )
        for dia in franja.dias:
            if normalizar(dia)[:3] not in ("*", "tod") and dia_a_indice(dia) is None:
                raise ErrorConfig(
                    f"Día inválido: {dia!r}. Usa lun, mar, mie, jue, vie, sab, dom o '*'."
                )
