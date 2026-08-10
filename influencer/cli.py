"""Interfaz de línea de comandos del piloto automático."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import analitica, planificador, runner
from .almacen import Almacen
from .cerebro import Cerebro
from .config import ErrorConfig, RUTA_POR_DEFECTO, cargar
from .modelos import BORRADOR, LISTA, PUBLICADA
from .plataformas import PlataformaDesconocida, crear
from .util import de_iso, recortar

PLANTILLA_CONFIG = Path(__file__).resolve().parent.parent / "influencer.example.yml"


def construir_parser() -> argparse.ArgumentParser:
    # Los flags comunes se aceptan antes y después del subcomando. Con
    # SUPPRESS, el subparser no pisa el valor dado en la posición global.
    comunes = argparse.ArgumentParser(add_help=False)
    comunes.add_argument("-c", "--config", default=argparse.SUPPRESS, help="ruta del YAML")
    comunes.add_argument("--simular", action="store_true", default=argparse.SUPPRESS,
                         help="no llama a ninguna red: escribe los posts en la carpeta de salida")
    comunes.add_argument("--sin-api", action="store_true", default=argparse.SUPPRESS,
                         help="no usa la API de Claude aunque haya credenciales")

    parser = argparse.ArgumentParser(
        prog="influencer",
        parents=[comunes],
        description="Workflow automático de redes sociales: ideas, calendario, "
        "redacción, publicación y métricas.",
    )
    sub = parser.add_subparsers(dest="comando", required=True)

    def nuevo(nombre: str, ayuda: str) -> argparse.ArgumentParser:
        return sub.add_parser(nombre, help=ayuda, parents=[comunes])

    nuevo("init", "crea un influencer.yml de ejemplo")
    nuevo("doctor", "revisa configuración y credenciales")

    p = nuevo("ideas", "genera ideas nuevas")
    p.add_argument("-n", "--cantidad", type=int, default=0)
    p.add_argument("--listar", action="store_true", help="solo muestra las pendientes")

    nuevo("plan", "reparte ideas en el calendario")
    p = nuevo("escribir", "redacta los borradores pendientes")
    p.add_argument("-n", "--cantidad", type=int, default=0)

    p = nuevo("cola", "muestra las próximas publicaciones")
    p.add_argument("-n", "--cantidad", type=int, default=15)

    p = nuevo("ver", "muestra una publicación completa")
    p.add_argument("id", type=int)

    p = nuevo("publicar", "publica lo que ya toca")
    p.add_argument("--id", type=int, action="append", dest="ids",
                   help="fuerza la publicación de un id concreto (repetible)")

    nuevo("metricas", "actualiza métricas de lo publicado")
    nuevo("informe", "resumen del canal")

    p = nuevo("run", "ejecuta el ciclo completo")
    p.add_argument("--una-vez", action="store_true", help="un solo ciclo y salir (para cron)")
    p.add_argument("--intervalo", type=int, default=900, help="segundos entre ciclos (por defecto 900)")
    p.add_argument("--sin-metricas", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = construir_parser().parse_args(argv)
    args.config = getattr(args, "config", str(RUTA_POR_DEFECTO))
    args.simular = getattr(args, "simular", False)
    args.sin_api = getattr(args, "sin_api", False)

    if args.comando == "init":
        return _init(args.config)

    try:
        cfg = cargar(args.config)
    except ErrorConfig as error:
        print(f"Configuración: {error}", file=sys.stderr)
        return 2

    with Almacen(cfg.base_datos) as almacen:
        cerebro = Cerebro(cfg, forzar_plantilla=args.sin_api)
        try:
            return _despachar(args, cfg, almacen, cerebro)
        finally:
            for aviso in cerebro.avisos:
                print(f"  aviso: {aviso}")


def _despachar(args, cfg, almacen, cerebro) -> int:
    comando = args.comando

    if comando == "doctor":
        return _doctor(cfg, cerebro, args.simular)

    if comando == "ideas":
        if args.listar:
            for idea in almacen.ideas(estado="pendiente"):
                print(f"  [{idea.id}] {idea.titulo}  ({idea.formato})")
            return 0
        nuevas = runner.generar_ideas(cfg, almacen, cerebro, args.cantidad)
        print(f"Ideas nuevas: {nuevas} (motor: {cerebro.motor})")
        return 0

    if comando == "plan":
        creadas = planificador.planificar(cfg, almacen)
        print(f"Huecos ocupados: {len(creadas)}")
        for publicacion in creadas:
            print(f"  {_fecha(publicacion.programada_en)}  {publicacion.plataforma:<12} {publicacion.titulo}")
        if not creadas:
            print("  (sin ideas pendientes o sin huecos libres)")
        return 0

    if comando == "escribir":
        escritas = planificador.redactar(cfg, almacen, cerebro, args.cantidad)
        print(f"Publicaciones redactadas: {len(escritas)} (motor: {cerebro.motor})")
        for publicacion in escritas:
            print(f"  [{publicacion.id}] {publicacion.plataforma:<12} {recortar(publicacion.gancho, 60)}")
        return 0

    if comando == "cola":
        pendientes = almacen.publicaciones(estados=[BORRADOR, LISTA], limite=args.cantidad)
        if not pendientes:
            print("Cola vacía. Lanza 'ideas' y 'plan'.")
        for publicacion in pendientes:
            print(
                f"  [{publicacion.id:>3}] {_fecha(publicacion.programada_en)}  "
                f"{publicacion.plataforma:<12} {publicacion.estado:<9} "
                f"{recortar(publicacion.titulo or publicacion.gancho, 46)}"
            )
        return 0

    if comando == "ver":
        publicacion = almacen.publicacion(args.id)
        if not publicacion:
            print(f"No existe la publicación {args.id}.", file=sys.stderr)
            return 1
        plataforma = cfg.plataforma(publicacion.plataforma)
        limite = plataforma.especificacion()["limite"] if plataforma else 0
        print(f"[{publicacion.id}] {publicacion.plataforma} · {publicacion.estado} · "
              f"{_fecha(publicacion.programada_en)}")
        print("-" * 60)
        print(publicacion.texto(limite))
        print("-" * 60)
        print(f"Visual: {publicacion.visual or '—'}")
        print(f"Alt:    {publicacion.texto_alt or '—'}")
        if publicacion.url:
            print(f"URL:    {publicacion.url}")
        if publicacion.error:
            print(f"Error:  {publicacion.error}")
        return 0

    if comando == "publicar":
        publicadas, fallidas, avisos = runner.publicar_pendientes(
            cfg, almacen, simular=args.simular, forzar=args.ids
        )
        print(f"Publicadas: {len(publicadas)} · fallidas: {len(fallidas)}")
        for publicacion in publicadas:
            print(f"  ✓ {analitica.resumen_publicacion(publicacion)}")
        for publicacion in fallidas:
            print(f"  ✗ {publicacion.plataforma}: {publicacion.error}")
        for aviso in avisos:
            print(f"  aviso: {aviso}")
        return 0 if not fallidas else 1

    if comando == "metricas":
        capturas, avisos = analitica.recolectar(cfg, almacen, args.simular)
        print(f"Métricas actualizadas: {capturas}")
        for aviso in avisos:
            print(f"  aviso: {aviso}")
        return 0

    if comando == "informe":
        print(analitica.informe(cfg, almacen))
        return 0

    if comando == "run":
        return _run(args, cfg, almacen, cerebro)

    print(f"Comando desconocido: {comando}", file=sys.stderr)
    return 2


def _run(args, cfg, almacen, cerebro) -> int:
    intervalo = max(args.intervalo, 30)
    while True:
        resumen = runner.ciclo(
            cfg, almacen, cerebro,
            simular=args.simular,
            con_metricas=not args.sin_metricas,
        )
        print(f"[{_fecha(None)}] {resumen.texto()}")
        for aviso in resumen.avisos:
            print(f"  aviso: {aviso}")
        if args.una_vez:
            return 0
        try:
            time.sleep(intervalo)
        except KeyboardInterrupt:
            print("\nParado.")
            return 0


def _doctor(cfg, cerebro, simular: bool) -> int:
    print(f"Configuración: {cfg.ruta}")
    print(f"Persona:       {cfg.persona.nombre} · {cfg.persona.nicho}")
    print(f"Motor:         {cerebro.motor}" + ("" if cerebro.motor == "claude" else
          "  (sin ANTHROPIC_API_KEY o sin el paquete 'anthropic': se usan plantillas)"))
    print(f"Base de datos: {cfg.base_datos}")
    print(f"Zona horaria:  {cfg.calendario.zona_horaria}")

    proximos = planificador.huecos(cfg)
    print(f"Huecos en los próximos {cfg.calendario.dias_horizonte} días: {len(proximos)}")
    for instante, plataformas in proximos[:5]:
        print(f"  {instante.strftime('%d/%m %H:%M UTC')}  {', '.join(plataformas)}")

    problemas = 0
    print("Plataformas:")
    for plataforma in cfg.plataformas:
        if not plataforma.activa:
            print(f"  · {plataforma.nombre:<12} desactivada")
            continue
        try:
            publicador = crear(plataforma, cfg.salida, simular)
        except PlataformaDesconocida as error:
            print(f"  ✗ {plataforma.nombre:<12} {error}")
            problemas += 1
            continue
        faltan = publicador.comprobar()
        if faltan:
            print(f"  ✗ {plataforma.nombre:<12} faltan credenciales: {', '.join(faltan)}")
            problemas += 1
        else:
            print(f"  ✓ {plataforma.nombre:<12} lista (límite {publicador.limite()} caracteres)")
    if problemas:
        print(f"\n{problemas} plataforma(s) sin configurar. Puedes probar igualmente con --simular.")
    return 0


def _init(ruta: str) -> int:
    destino = Path(ruta)
    if destino.exists():
        print(f"'{destino}' ya existe; no lo toco.")
        return 1
    if not PLANTILLA_CONFIG.exists():
        print(f"No encuentro la plantilla {PLANTILLA_CONFIG}.", file=sys.stderr)
        return 1
    destino.write_text(PLANTILLA_CONFIG.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Creado '{destino}'. Edítalo y luego ejecuta:  python -m influencer doctor")
    return 0


def _fecha(marca: str | None) -> str:
    from .util import ahora

    momento = de_iso(marca) if marca else ahora()
    return momento.strftime("%d/%m %H:%M UTC") if momento else str(marca)
