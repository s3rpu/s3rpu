"""Calendario editorial: reparte ideas en huecos y redacta los borradores."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .almacen import Almacen
from .cerebro import Cerebro
from .config import Config
from .modelos import BORRADOR, IDEA_PENDIENTE, IDEA_USADA, Idea, LISTA, Publicacion
from .util import a_iso, ahora, de_iso, normalizar


def zona(cfg: Config) -> ZoneInfo | timezone:
    try:
        return ZoneInfo(cfg.calendario.zona_horaria)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return timezone.utc


def huecos(cfg: Config, desde: datetime | None = None) -> list[tuple[datetime, list[str]]]:
    """Huecos futuros del calendario, en orden: [(instante UTC, [plataformas])]."""
    desde = desde or ahora()
    tz = zona(cfg)
    inicio_local = desde.astimezone(tz)
    activas = [p.nombre for p in cfg.activas()]
    agenda: dict[datetime, list[str]] = {}

    for delta in range(max(cfg.calendario.dias_horizonte, 1)):
        dia = (inicio_local + timedelta(days=delta)).date()
        for franja in cfg.calendario.franjas:
            indices = franja.indices_dias()
            if indices is not None and dia.weekday() not in indices:
                continue
            plataformas = [
                p.nombre
                for p in cfg.activas()
                if not franja.plataformas
                or normalizar(p.nombre) in {normalizar(n) for n in franja.plataformas}
            ]
            if not plataformas:
                continue
            for hora in franja.horas:
                h, m = (int(x) for x in hora.split(":"))
                local = datetime(dia.year, dia.month, dia.day, h, m, tzinfo=tz)
                instante = local.astimezone(timezone.utc)
                if instante <= desde:
                    continue
                acumulado = agenda.setdefault(instante, [])
                for nombre in plataformas:
                    if nombre not in acumulado and nombre in activas:
                        acumulado.append(nombre)

    return sorted(agenda.items(), key=lambda par: par[0])


def planificar(cfg: Config, almacen: Almacen, desde: datetime | None = None) -> list[Publicacion]:
    """Crea borradores para los huecos libres, uno por plataforma.

    Todas las plataformas que coinciden en el mismo instante comparten idea:
    es la misma publicación adaptada a cada red.
    """
    ocupados = almacen.huecos_ocupados()
    pendientes = almacen.ideas(estado=IDEA_PENDIENTE)
    creadas: list[Publicacion] = []
    if not pendientes:
        return creadas

    cola = list(pendientes)
    for instante, plataformas in huecos(cfg, desde):
        marca = a_iso(instante)
        libres = [p for p in plataformas if (p, marca) not in ocupados]
        if not libres:
            continue
        if not cola:
            break
        idea = cola.pop(0)
        for nombre in libres:
            plataforma = cfg.plataforma(nombre)
            publicacion = Publicacion(
                idea_id=idea.id,
                plataforma=nombre,
                formato=(plataforma.formato if plataforma else idea.formato),
                titulo=idea.titulo,
                programada_en=marca,
                estado=BORRADOR,
            )
            creadas.append(almacen.guardar_publicacion(publicacion))
            ocupados.add((nombre, marca))
        if idea.id:
            almacen.marcar_idea(idea.id, IDEA_USADA)
    return creadas


def redactar(cfg: Config, almacen: Almacen, cerebro: Cerebro, limite: int = 0) -> list[Publicacion]:
    """Convierte borradores en publicaciones listas para salir."""
    borradores = almacen.publicaciones(estados=[BORRADOR], limite=limite)
    escritas: list[Publicacion] = []
    for publicacion in borradores:
        plataforma = cfg.plataforma(publicacion.plataforma)
        if plataforma is None:
            publicacion.error = "La plataforma ya no está en la configuración."
            almacen.guardar_publicacion(publicacion)
            continue
        idea = almacen.idea(publicacion.idea_id) or Idea(
            titulo=publicacion.titulo or "Contenido", formato=publicacion.formato
        )
        texto = cerebro.escribir(idea, plataforma.especificacion())
        publicacion.gancho = texto["gancho"]
        publicacion.cuerpo = texto["cuerpo"]
        publicacion.cta = texto["cta"]
        publicacion.hashtags = texto["hashtags"]
        publicacion.visual = texto["visual"]
        publicacion.texto_alt = texto["texto_alt"]
        publicacion.generado_por = texto["generado_por"]
        publicacion.titulo = publicacion.titulo or idea.titulo
        publicacion.estado = LISTA
        publicacion.error = ""
        almacen.guardar_publicacion(publicacion)
        escritas.append(publicacion)
    return escritas


def pendientes_de_publicar(almacen: Almacen, momento: datetime | None = None) -> list[Publicacion]:
    return almacen.publicaciones(estados=[LISTA], hasta=a_iso(momento or ahora()))


def proximas(almacen: Almacen, cantidad: int = 10) -> list[Publicacion]:
    futuras = [
        p
        for p in almacen.publicaciones(estados=[BORRADOR, LISTA])
        if (de_iso(p.programada_en) or ahora()) >= ahora()
    ]
    return futuras[:cantidad]
