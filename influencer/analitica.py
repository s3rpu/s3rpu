"""Recogida de métricas, informes y aprendizajes que realimentan las ideas."""

from __future__ import annotations

from collections import defaultdict

from .almacen import Almacen
from .config import Config
from .modelos import FALLIDA, PUBLICADA, Metrica, Publicacion
from .plataformas import FaltanCredenciales, PlataformaDesconocida, crear
from .util import de_iso, recortar


def recolectar(cfg: Config, almacen: Almacen, simular: bool = False) -> tuple[int, list[str]]:
    """Actualiza las métricas de todo lo publicado. Devuelve (capturas, avisos)."""
    publicadas = [p for p in almacen.publicaciones(estados=[PUBLICADA]) if p.externa_id]
    capturas = 0
    avisos: list[str] = []
    if simular:
        return 0, avisos

    publicadores: dict[str, object] = {}
    for publicacion in publicadas:
        plataforma = cfg.plataforma(publicacion.plataforma)
        if plataforma is None:
            continue
        try:
            publicador = publicadores.get(plataforma.clave) or crear(plataforma, cfg.salida)
        except PlataformaDesconocida as error:
            avisos.append(str(error))
            continue
        publicadores[plataforma.clave] = publicador
        if not getattr(publicador, "con_metricas", False):
            continue
        try:
            metrica = publicador.metricas(publicacion)
        except Exception as error:  # credenciales, red o cambios en la API
            avisos.append(f"{publicacion.plataforma}: no pude leer métricas ({error}).")
            continue
        if metrica:
            almacen.guardar_metrica(metrica)
            capturas += 1
    return capturas, avisos


def aprendizajes(almacen: Almacen, cantidad: int = 5) -> list[str]:
    """Frases con lo que mejor ha funcionado, para alimentar nuevas ideas."""
    metricas = almacen.ultimas_metricas()
    if not metricas:
        return []
    publicaciones = {p.id: p for p in almacen.publicaciones(estados=[PUBLICADA])}
    ranking = sorted(
        (
            (m.interacciones, publicaciones[pid])
            for pid, m in metricas.items()
            if pid in publicaciones
        ),
        key=lambda par: par[0],
        reverse=True,
    )
    salida = []
    for interacciones, publicacion in ranking[:cantidad]:
        if interacciones <= 0:
            continue
        salida.append(
            f"«{publicacion.titulo or recortar(publicacion.gancho, 60)}» en "
            f"{publicacion.plataforma} ({interacciones} interacciones)"
        )
    return salida


def informe(cfg: Config, almacen: Almacen) -> str:
    """Informe en texto plano del estado del canal."""
    todas = almacen.publicaciones()
    metricas = almacen.ultimas_metricas()
    por_estado: dict[str, int] = defaultdict(int)
    for publicacion in todas:
        por_estado[publicacion.estado] += 1

    agregado: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for publicacion in todas:
        if publicacion.estado != PUBLICADA:
            continue
        fila = agregado[publicacion.plataforma]
        fila["publicaciones"] += 1
        metrica = metricas.get(int(publicacion.id or 0))
        if metrica:
            fila["impresiones"] += metrica.impresiones
            fila["interacciones"] += metrica.interacciones

    lineas = [
        f"Informe de «{cfg.persona.nombre}» — {cfg.persona.nicho}",
        "=" * 60,
        "",
        "Estado de la cola:",
    ]
    for estado in ("borrador", "lista", PUBLICADA, FALLIDA):
        lineas.append(f"  {estado:<12} {por_estado.get(estado, 0):>4}")
    lineas.append(f"  {'ideas libres':<12} {almacen.contar_ideas():>4}")
    lineas.append("")

    if agregado:
        lineas.append("Rendimiento por plataforma:")
        lineas.append(f"  {'plataforma':<14}{'posts':>7}{'impres.':>10}{'interac.':>10}{'tasa':>8}")
        for nombre, fila in sorted(agregado.items()):
            impresiones = fila["impresiones"]
            interacciones = fila["interacciones"]
            tasa = f"{(interacciones / impresiones * 100):.1f}%" if impresiones else "—"
            lineas.append(
                f"  {nombre:<14}{fila['publicaciones']:>7}{impresiones:>10}{interacciones:>10}{tasa:>8}"
            )
        lineas.append("")

    mejores = aprendizajes(almacen, 5)
    if mejores:
        lineas.append("Lo que mejor funciona:")
        lineas.extend(f"  · {m}" for m in mejores)
        lineas.append("")

    fallidas = [p for p in todas if p.estado == FALLIDA]
    if fallidas:
        lineas.append("Publicaciones fallidas (revisa credenciales):")
        for publicacion in fallidas[:10]:
            lineas.append(f"  · {publicacion.plataforma} {publicacion.programada_en}: {publicacion.error}")
        lineas.append("")

    proximas = [p for p in todas if p.estado in ("borrador", "lista")]
    proximas.sort(key=lambda p: p.programada_en)
    if proximas:
        lineas.append("Próximas salidas:")
        for publicacion in proximas[:10]:
            momento = de_iso(publicacion.programada_en)
            marca = momento.strftime("%d/%m %H:%M UTC") if momento else publicacion.programada_en
            lineas.append(
                f"  · {marca}  {publicacion.plataforma:<12} "
                f"{recortar(publicacion.titulo or publicacion.gancho, 48)}"
            )
    return "\n".join(lineas)


def resumen_publicacion(publicacion: Publicacion, metrica: Metrica | None = None) -> str:
    partes = [f"[{publicacion.plataforma}] {recortar(publicacion.titulo or publicacion.gancho, 60)}"]
    if publicacion.url:
        partes.append(publicacion.url)
    if metrica:
        partes.append(f"{metrica.interacciones} interacciones")
    return " — ".join(partes)
