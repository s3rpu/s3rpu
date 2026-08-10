"""Pruebas del workflow. Se ejecutan sin red y sin credenciales:

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from influencer import analitica, planificador, runner  # noqa: E402
from influencer.almacen import Almacen  # noqa: E402
from influencer.cerebro import Cerebro  # noqa: E402
from influencer.config import ErrorConfig, desde_dict  # noqa: E402
from influencer.modelos import (  # noqa: E402
    BORRADOR,
    FALLIDA,
    LISTA,
    PUBLICADA,
    Idea,
    Metrica,
    Publicacion,
)
from influencer.util import a_iso, recortar  # noqa: E402

BASE = {
    "persona": {"nombre": "Prueba", "nicho": "entreno en casa", "temas": ["fuerza", "hábitos"]},
    "plataformas": [
        {"nombre": "simulacion", "formato": "post"},
        {"nombre": "x", "formato": "hilo", "credenciales": {"token": "t"}},
        {"nombre": "telegram", "formato": "post"},  # sin credenciales: falla siempre
    ],
    "calendario": {
        "zona_horaria": "UTC",
        "dias_horizonte": 3,
        "franjas": [{"dias": ["*"], "horas": ["09:00", "19:00"]}],
    },
    "ideas_minimas": 4,
}


def config(**cambios):
    datos = {**BASE, **cambios}
    return desde_dict(datos)


class TestConfig(unittest.TestCase):
    def test_carga_basica(self):
        cfg = config()
        self.assertEqual(cfg.persona.nombre, "Prueba")
        self.assertEqual(len(cfg.activas()), 3)
        self.assertEqual(cfg.plataforma("X").formato, "hilo")

    def test_expansion_de_variables(self):
        os.environ["TOKEN_DE_PRUEBA"] = "secreto-123"
        from influencer.config import _expandir

        self.assertEqual(_expandir({"a": "${TOKEN_DE_PRUEBA}"}), {"a": "secreto-123"})

    def test_hora_invalida(self):
        with self.assertRaises(ErrorConfig):
            config(calendario={"franjas": [{"horas": ["25:00"]}]})

    def test_plataforma_desconocida_en_franja(self):
        with self.assertRaises(ErrorConfig):
            config(calendario={"franjas": [{"horas": ["09:00"], "plataformas": ["tiktok"]}]})

    def test_especificacion_por_red(self):
        cfg = config()
        self.assertEqual(cfg.plataforma("x").especificacion()["limite"], 275)


class TestUtil(unittest.TestCase):
    def test_recortar_respeta_palabras(self):
        texto = "una frase bastante larga que hay que recortar por algún sitio"
        corto = recortar(texto, 20)
        self.assertLessEqual(len(corto), 20)
        self.assertTrue(corto.endswith("…"))

    def test_texto_de_publicacion_cabe_en_el_limite(self):
        pub = Publicacion(
            plataforma="x",
            programada_en=a_iso(datetime.now(timezone.utc)),
            gancho="Gancho corto.",
            cuerpo="Cuerpo " * 200,
            cta="Cuéntamelo.",
            hashtags=["#fuerza", "#casa"],
        )
        self.assertLessEqual(len(pub.texto(275)), 275)


class TestAlmacen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.almacen = Almacen(Path(self.tmp.name) / "test.db")

    def tearDown(self):
        self.almacen.cerrar()
        self.tmp.cleanup()

    def test_idea_duplicada_no_se_repite(self):
        self.almacen.guardar_idea(Idea(titulo="Misma idea"))
        self.almacen.guardar_idea(Idea(titulo="Misma idea"))
        self.assertEqual(self.almacen.contar_ideas(), 1)

    def test_hueco_duplicado_no_se_repite(self):
        marca = a_iso(datetime.now(timezone.utc))
        self.almacen.guardar_publicacion(Publicacion(plataforma="x", programada_en=marca))
        self.almacen.guardar_publicacion(Publicacion(plataforma="x", programada_en=marca))
        self.assertEqual(len(self.almacen.publicaciones()), 1)

    def test_roundtrip_de_hashtags(self):
        marca = a_iso(datetime.now(timezone.utc))
        guardada = self.almacen.guardar_publicacion(
            Publicacion(plataforma="x", programada_en=marca, hashtags=["#a", "#b"])
        )
        recuperada = self.almacen.publicacion(guardada.id)
        self.assertEqual(recuperada.hashtags, ["#a", "#b"])

    def test_ultima_metrica_gana(self):
        marca = a_iso(datetime.now(timezone.utc))
        pub = self.almacen.guardar_publicacion(Publicacion(plataforma="x", programada_en=marca))
        self.almacen.guardar_metrica(Metrica(pub.id, "2026-01-01T00:00:00+00:00", likes=1))
        self.almacen.guardar_metrica(Metrica(pub.id, "2026-02-01T00:00:00+00:00", likes=9))
        self.assertEqual(self.almacen.ultimas_metricas()[pub.id].likes, 9)


class TestCerebroPlantilla(unittest.TestCase):
    def setUp(self):
        self.cfg = config()
        self.cerebro = Cerebro(self.cfg, forzar_plantilla=True)

    def test_motor_es_plantilla(self):
        self.assertEqual(self.cerebro.motor, "plantilla")

    def test_genera_ideas_sin_repetir(self):
        ideas = self.cerebro.ideas(6)
        self.assertEqual(len(ideas), 6)
        self.assertEqual(len({i.titulo for i in ideas}), 6)

    def test_respeta_titulos_a_evitar(self):
        primeras = self.cerebro.ideas(4)
        segundas = self.cerebro.ideas(4, evitar_titulos=[i.titulo for i in primeras])
        self.assertFalse({i.titulo for i in primeras} & {i.titulo for i in segundas})

    def test_texto_respeta_limites_de_la_red(self):
        idea = self.cerebro.ideas(1)[0]
        esp = self.cfg.plataforma("x").especificacion()
        texto = self.cerebro.escribir(idea, esp)
        self.assertLessEqual(len(texto["hashtags"]), esp["hashtags_max"])
        self.assertTrue(texto["cuerpo"])
        self.assertLessEqual(len(texto["texto_alt"]), 120)


class _Bloque:
    def __init__(self, texto):
        self.type = "text"
        self.text = texto


class _Respuesta:
    def __init__(self, texto, stop_reason="end_turn"):
        self.content = [_Bloque(texto)]
        self.stop_reason = stop_reason


class _ClienteFalso:
    """Sustituto del cliente de Anthropic: guarda la petición y devuelve JSON."""

    def __init__(self, respuesta):
        self.respuesta = respuesta
        self.peticiones = []
        self.messages = self

    def create(self, **kwargs):
        self.peticiones.append(kwargs)
        if isinstance(self.respuesta, Exception):
            raise self.respuesta
        return self.respuesta


class TestCerebroConAPI(unittest.TestCase):
    """Comprueba la forma de la petición y el tratamiento de la respuesta."""

    def setUp(self):
        self.cfg = config()
        self.cerebro = Cerebro(self.cfg, forzar_plantilla=True)

    def test_peticion_de_ideas(self):
        json_ideas = (
            '{"ideas": [{"titulo": "Sentadilla sin barra", "angulo": "progresar sin material",'
            ' "formato": "post", "gancho": "Se puede.", "temas": ["fuerza"]}]}'
        )
        self.cerebro.cliente = _ClienteFalso(_Respuesta(json_ideas))
        ideas = self.cerebro.ideas(1, aprendizajes=["algo funcionó"])

        self.assertEqual(ideas[0].titulo, "Sentadilla sin barra")
        peticion = self.cerebro.cliente.peticiones[0]
        self.assertEqual(peticion["model"], self.cfg.modelo.id)
        self.assertEqual(peticion["output_config"]["effort"], self.cfg.modelo.esfuerzo)
        self.assertEqual(peticion["output_config"]["format"]["type"], "json_schema")
        self.assertIn("algo funcionó", peticion["messages"][0]["content"])
        self.assertIn(self.cfg.persona.nicho, peticion["system"])

    def test_formato_invalido_se_corrige(self):
        json_ideas = ('{"ideas": [{"titulo": "T", "angulo": "a", "formato": "tiktok-dance",'
                      ' "gancho": "g", "temas": []}]}')
        self.cerebro.cliente = _ClienteFalso(_Respuesta(json_ideas))
        self.assertIn(self.cerebro.ideas(1)[0].formato, {"post", "hilo"})

    def test_texto_recorta_y_limita_hashtags(self):
        json_texto = (
            '{"gancho": "gancho fuerte", "cuerpo": "' + "palabra " * 300 + '",'
            ' "cta": "Comenta", "hashtags": ["#a", "#a", "#b", "#c", "#d", "#e"],'
            ' "visual": "foto", "texto_alt": "' + "x" * 300 + '"}'
        )
        self.cerebro.cliente = _ClienteFalso(_Respuesta(json_texto))
        esp = self.cfg.plataforma("x").especificacion()
        texto = self.cerebro.escribir(Idea(titulo="T"), esp)

        self.assertEqual(texto["generado_por"], "claude")
        self.assertEqual(texto["gancho"][0], "G")  # se capitaliza
        self.assertEqual(texto["hashtags"], ["#a", "#b", "#c"])  # sin duplicados, máx. 3
        self.assertLessEqual(len(texto["texto_alt"]), 120)
        montado = Publicacion(
            plataforma="x", programada_en=a_iso(datetime.now(timezone.utc)),
            gancho=texto["gancho"], cuerpo=texto["cuerpo"], cta=texto["cta"],
            hashtags=texto["hashtags"],
        )
        self.assertLessEqual(len(montado.texto(esp["limite"])), esp["limite"])

    def test_rechazo_cae_en_plantilla(self):
        self.cerebro.cliente = _ClienteFalso(_Respuesta("", stop_reason="refusal"))
        texto = self.cerebro.escribir(Idea(titulo="T"), self.cfg.plataforma("x").especificacion())
        self.assertEqual(texto["generado_por"], "plantilla")
        self.assertTrue(self.cerebro.avisos)

    def test_error_de_red_cae_en_plantilla(self):
        self.cerebro.cliente = _ClienteFalso(ConnectionError("sin red"))
        ideas = self.cerebro.ideas(2)
        self.assertEqual(len(ideas), 2)
        self.assertTrue(any("API no disponible" in a for a in self.cerebro.avisos))

    def test_json_roto_cae_en_plantilla(self):
        self.cerebro.cliente = _ClienteFalso(_Respuesta("{no soy json"))
        texto = self.cerebro.escribir(Idea(titulo="T"), self.cfg.plataforma("x").especificacion())
        self.assertEqual(texto["generado_por"], "plantilla")


class TestPlanificador(unittest.TestCase):
    def setUp(self):
        self.cfg = config()
        self.tmp = tempfile.TemporaryDirectory()
        self.almacen = Almacen(Path(self.tmp.name) / "test.db")

    def tearDown(self):
        self.almacen.cerrar()
        self.tmp.cleanup()

    def test_huecos_son_futuros_y_ordenados(self):
        ahora = datetime(2026, 3, 2, 12, 0, tzinfo=timezone.utc)  # lunes
        slots = planificador.huecos(self.cfg, ahora)
        self.assertTrue(slots)
        instantes = [s[0] for s in slots]
        self.assertEqual(instantes, sorted(instantes))
        self.assertTrue(all(i > ahora for i in instantes))
        self.assertEqual(slots[0][0], datetime(2026, 3, 2, 19, 0, tzinfo=timezone.utc))

    def test_filtra_por_dia_de_la_semana(self):
        cfg = config(calendario={
            "zona_horaria": "UTC",
            "dias_horizonte": 7,
            "franjas": [{"dias": ["dom"], "horas": ["10:00"]}],
        })
        slots = planificador.huecos(cfg, datetime(2026, 3, 2, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(len(slots), 1)
        self.assertEqual(slots[0][0].weekday(), 6)

    def test_plan_comparte_idea_entre_redes_del_mismo_hueco(self):
        cerebro = Cerebro(self.cfg, forzar_plantilla=True)
        for idea in cerebro.ideas(4):
            self.almacen.guardar_idea(idea)
        creadas = planificador.planificar(self.cfg, self.almacen)
        por_hueco = {}
        for pub in creadas:
            por_hueco.setdefault(pub.programada_en, set()).add(pub.idea_id)
        self.assertTrue(all(len(ids) == 1 for ids in por_hueco.values()))
        self.assertEqual({p.plataforma for p in creadas}, {"simulacion", "x", "telegram"})

    def test_plan_no_duplica_al_repetirse(self):
        cerebro = Cerebro(self.cfg, forzar_plantilla=True)
        for idea in cerebro.ideas(6):
            self.almacen.guardar_idea(idea)
        primeras = planificador.planificar(self.cfg, self.almacen)
        segundas = planificador.planificar(self.cfg, self.almacen)
        self.assertTrue(primeras)
        self.assertEqual(segundas, [])

    def test_redactar_pasa_de_borrador_a_lista(self):
        cerebro = Cerebro(self.cfg, forzar_plantilla=True)
        self.almacen.guardar_idea(cerebro.ideas(1)[0])
        planificador.planificar(self.cfg, self.almacen)
        escritas = planificador.redactar(self.cfg, self.almacen, cerebro)
        self.assertTrue(escritas)
        self.assertTrue(all(p.estado == LISTA and p.cuerpo for p in escritas))
        self.assertEqual(self.almacen.publicaciones(estados=[BORRADOR]), [])


class TestCicloCompleto(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.cfg = config()
        self.cfg.base_datos = str(Path(self.tmp.name) / "test.db")
        self.cfg.salida = str(Path(self.tmp.name) / "salida")
        self.almacen = Almacen(self.cfg.base_datos)
        self.cerebro = Cerebro(self.cfg, forzar_plantilla=True)

    def tearDown(self):
        self.almacen.cerrar()
        self.tmp.cleanup()

    def test_ciclo_llena_la_cola(self):
        resumen = runner.ciclo(self.cfg, self.almacen, self.cerebro, simular=True)
        self.assertGreaterEqual(resumen.ideas, 4)
        self.assertGreater(resumen.planificadas, 0)
        self.assertEqual(resumen.redactadas, resumen.planificadas)
        self.assertEqual(resumen.publicadas, 0)  # todo está en el futuro

    def test_publica_cuando_llega_la_hora(self):
        runner.ciclo(self.cfg, self.almacen, self.cerebro, simular=True)
        futuro = datetime.now(timezone.utc) + timedelta(days=30)
        publicadas, fallidas, _ = runner.publicar_pendientes(
            self.cfg, self.almacen, simular=True, momento=futuro
        )
        self.assertTrue(publicadas)
        self.assertFalse(fallidas)
        self.assertTrue(all(p.estado == PUBLICADA and p.externa_id for p in publicadas))
        ficheros = list(Path(self.cfg.salida).glob("*.md"))
        self.assertEqual(len(ficheros), len(publicadas))
        self.assertIn("## Texto", ficheros[0].read_text(encoding="utf-8"))

    def test_fallo_reintenta_y_acaba_en_fallida(self):
        self.cfg.reintentos = 2
        runner.ciclo(self.cfg, self.almacen, self.cerebro, simular=True)
        # 'telegram' no tiene credenciales: falla sin tocar la red.
        pendiente = next(
            p for p in self.almacen.publicaciones(estados=[LISTA]) if p.plataforma == "telegram"
        )
        futuro = datetime.now(timezone.utc) + timedelta(days=30)

        runner.publicar_pendientes(self.cfg, self.almacen, momento=futuro, forzar=[pendiente.id])
        self.assertEqual(self.almacen.publicacion(pendiente.id).estado, LISTA)  # reintentable

        runner.publicar_pendientes(self.cfg, self.almacen, momento=futuro, forzar=[pendiente.id])
        recargada = self.almacen.publicacion(pendiente.id)
        self.assertEqual(recargada.estado, FALLIDA)
        self.assertEqual(recargada.intentos, 2)
        self.assertTrue(recargada.error)

    def test_informe_y_aprendizajes(self):
        runner.ciclo(self.cfg, self.almacen, self.cerebro, simular=True)
        futuro = datetime.now(timezone.utc) + timedelta(days=30)
        publicadas, _, _ = runner.publicar_pendientes(
            self.cfg, self.almacen, simular=True, momento=futuro
        )
        self.almacen.guardar_metrica(
            Metrica(publicadas[0].id, a_iso(futuro), impresiones=1000, likes=80, comentarios=20)
        )
        texto = analitica.informe(self.cfg, self.almacen)
        self.assertIn("Rendimiento por plataforma", texto)
        self.assertIn("Lo que mejor funciona", texto)
        self.assertTrue(analitica.aprendizajes(self.almacen))


if __name__ == "__main__":
    unittest.main()
