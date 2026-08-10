"""El piloto automático: encadena todas las etapas del workflow."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from . import analitica, planificador
from .almacen import Almacen
from .cerebro import Cerebro
from .config import Config
from .modelos import FALLIDA, IDEA_PENDIENTE, LISTA, PUBLICADA, Publicacion
from .plataformas import FaltanCredenciales, PlataformaDesconocida, crear
from .util import a_iso, ahora


@dataclass
class Resumen:
    ideas: int = 0
    planificadas: int = 0
    redactadas: int = 0
    publicadas: int = 0
    fallidas: int = 0
    reintentables: int = 0
    metricas: int = 0
    avisos: list[str] = field(default_factory=list)

    def texto(self) -> str:
        base = (
            f"ideas +{self.ideas} · planificadas {self.planificadas} · "
            f"redactadas {self.redactadas} · publicadas {self.publicadas} · "
            f"fallidas {self.fallidas} · métricas {self.metricas}"
        )
        if self.reintentables:
            base += f" · pendientes de reintento {self.reintentables}"
        return base


def generar_ideas(cfg: Config, almacen: Almacen, cerebro: Cerebro, cantidad: int = 0) -> int:
    """Rellena el banco de ideas hasta el mínimo configurado."""
    disponibles = almacen.contar_ideas(IDEA_PENDIENTE)
    faltan = cantidad or max(cfg.ideas_minimas - disponibles, 0)
    if faltan <= 0:
        return 0
    ideas = cerebro.ideas(
        cantidad=faltan,
        evitar_titulos=almacen.titulos_ideas(),
        aprendizajes=analitica.aprendizajes(almacen),
    )
    antes = almacen.contar_ideas(IDEA_PENDIENTE)
    for idea in ideas:
        almacen.guardar_idea(idea)
    return almacen.contar_ideas(IDEA_PENDIENTE) - antes


def publicar_pendientes(
    cfg: Config,
    almacen: Almacen,
    simular: bool = False,
    momento: datetime | None = None,
    forzar: list[int] | None = None,
) -> tuple[list[Publicacion], list[Publicacion], list[str]]:
    """Publica todo lo que ya toca. Devuelve (publicadas, fallidas, avisos)."""
    if forzar:
        cola = [p for p in (almacen.publicacion(i) for i in forzar) if p]
    else:
        cola = planificador.pendientes_de_publicar(almacen, momento)

    publicadas: list[Publicacion] = []
    fallidas: list[Publicacion] = []
    avisos: list[str] = []
    publicadores: dict[str, object] = {}

    for publicacion in cola:
        plataforma = cfg.plataforma(publicacion.plataforma)
        if plataforma is None:
            _fallar(almacen, publicacion, cfg, "La plataforma ya no existe en la configuración.")
            fallidas.append(publicacion)
            continue
        clave = f"{plataforma.clave}|{simular}"
        try:
            publicador = publicadores.get(clave) or crear(plataforma, cfg.salida, simular)
        except PlataformaDesconocida as error:
            _fallar(almacen, publicacion, cfg, str(error))
            fallidas.append(publicacion)
            continue
        publicadores[clave] = publicador

        try:
            resultado = publicador.publicar(publicacion)
        except FaltanCredenciales as error:
            _fallar(almacen, publicacion, cfg, str(error))
            avisos.append(str(error))
            fallidas.append(publicacion)
            continue
        except Exception as error:  # red, API caída, respuesta inesperada
            _fallar(almacen, publicacion, cfg, f"{error.__class__.__name__}: {error}")
            fallidas.append(publicacion)
            continue

        if not resultado.ok:
            _fallar(almacen, publicacion, cfg, resultado.error or "Error desconocido.")
            fallidas.append(publicacion)
            continue

        publicacion.estado = PUBLICADA
        publicacion.publicada_en = a_iso(ahora())
        publicacion.externa_id = resultado.externa_id
        publicacion.url = resultado.url
        publicacion.error = ""
        almacen.guardar_publicacion(publicacion)
        almacen.registrar("publicar", analitica.resumen_publicacion(publicacion))
        publicadas.append(publicacion)

    return publicadas, fallidas, avisos


def _fallar(almacen: Almacen, publicacion: Publicacion, cfg: Config, error: str) -> None:
    """Marca el intento fallido; agota reintentos antes de rendirse."""
    publicacion.intentos += 1
    publicacion.error = error
    publicacion.estado = FALLIDA if publicacion.intentos >= cfg.reintentos else LISTA
    almacen.guardar_publicacion(publicacion)
    almacen.registrar(
        "publicar",
        f"{publicacion.plataforma} ({publicacion.intentos}/{cfg.reintentos}): {error}",
        nivel="error",
    )


def ciclo(
    cfg: Config,
    almacen: Almacen,
    cerebro: Cerebro,
    simular: bool = False,
    momento: datetime | None = None,
    con_metricas: bool = True,
) -> Resumen:
    """Una vuelta completa: ideas → calendario → textos → publicar → medir."""
    resumen = Resumen()

    resumen.ideas = generar_ideas(cfg, almacen, cerebro)
    resumen.planificadas = len(planificador.planificar(cfg, almacen, momento))
    resumen.redactadas = len(planificador.redactar(cfg, almacen, cerebro))

    publicadas, fallidas, avisos = publicar_pendientes(cfg, almacen, simular, momento)
    resumen.publicadas = len(publicadas)
    resumen.fallidas = len([p for p in fallidas if p.estado == FALLIDA])
    resumen.reintentables = len([p for p in fallidas if p.estado == LISTA])
    resumen.avisos.extend(avisos)

    if con_metricas:
        capturas, avisos_metricas = analitica.recolectar(cfg, almacen, simular)
        resumen.metricas = capturas
        resumen.avisos.extend(avisos_metricas)

    resumen.avisos.extend(cerebro.avisos)
    cerebro.avisos.clear()
    almacen.registrar("ciclo", resumen.texto())
    return resumen
