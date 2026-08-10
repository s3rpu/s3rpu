"""Generación de contenido.

Dos motores intercambiables:

* ``claude``    — usa la API de Anthropic (requiere el paquete ``anthropic`` y
  credenciales en el entorno). Es el que produce contenido de verdad.
* ``plantilla`` — generador local determinista. No necesita red ni claves, así
  que el workflow completo se puede probar y ejecutar sin API.

El resto del programa no sabe cuál está activo.
"""

from __future__ import annotations

import json
import os
import random
from typing import Any

from .config import Config, Persona
from .modelos import Idea
from .util import hashtag, normalizar, recortar, slug

ESQUEMA_IDEAS = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "angulo": {"type": "string"},
                    "formato": {"type": "string"},
                    "gancho": {"type": "string"},
                    "temas": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["titulo", "angulo", "formato", "gancho", "temas"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["ideas"],
    "additionalProperties": False,
}

ESQUEMA_TEXTO = {
    "type": "object",
    "properties": {
        "gancho": {"type": "string"},
        "cuerpo": {"type": "string"},
        "cta": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "visual": {"type": "string"},
        "texto_alt": {"type": "string"},
    },
    "required": ["gancho", "cuerpo", "cta", "hashtags", "visual", "texto_alt"],
    "additionalProperties": False,
}


class Cerebro:
    def __init__(self, cfg: Config, forzar_plantilla: bool = False):
        self.cfg = cfg
        self.cliente = None if forzar_plantilla else _cliente()
        self.avisos: list[str] = []

    @property
    def motor(self) -> str:
        return "claude" if self.cliente else "plantilla"

    # ----------------------------------------------------------------- ideas

    def ideas(
        self,
        cantidad: int,
        evitar_titulos: list[str] | None = None,
        aprendizajes: list[str] | None = None,
    ) -> list[Idea]:
        evitar_titulos = evitar_titulos or []
        if self.cliente:
            datos = self._pedir(
                sistema=_sistema(self.cfg.persona),
                prompt=_prompt_ideas(self.cfg, cantidad, evitar_titulos, aprendizajes or []),
                esquema=ESQUEMA_IDEAS,
            )
            if datos:
                ideas = [
                    Idea(
                        titulo=str(i.get("titulo", "")).strip(),
                        angulo=str(i.get("angulo", "")).strip(),
                        formato=_formato_valido(self.cfg, i.get("formato")),
                        gancho=str(i.get("gancho", "")).strip(),
                        temas=[str(t) for t in (i.get("temas") or [])][:6],
                    )
                    for i in datos.get("ideas", [])
                ]
                ideas = [i for i in ideas if i.titulo]
                if ideas:
                    return ideas[:cantidad]
        return _ideas_plantilla(self.cfg, cantidad, evitar_titulos)

    # ---------------------------------------------------------------- textos

    def escribir(self, idea: Idea, especificacion: dict[str, Any]) -> dict[str, Any]:
        """Devuelve gancho, cuerpo, cta, hashtags, visual y texto_alt."""
        if self.cliente:
            datos = self._pedir(
                sistema=_sistema(self.cfg.persona),
                prompt=_prompt_texto(self.cfg, idea, especificacion),
                esquema=ESQUEMA_TEXTO,
            )
            if datos and datos.get("cuerpo"):
                return _sanear(datos, especificacion, self.cfg.persona, "claude")
        return _sanear(_texto_plantilla(self.cfg, idea, especificacion),
                       especificacion, self.cfg.persona, "plantilla")

    # ------------------------------------------------------------- interno

    def _pedir(self, sistema: str, prompt: str, esquema: dict) -> dict | None:
        modelo = self.cfg.modelo
        try:
            respuesta = self.cliente.messages.create(
                model=modelo.id,
                max_tokens=modelo.max_tokens,
                system=sistema,
                output_config={
                    "effort": modelo.esfuerzo,
                    "format": {"type": "json_schema", "schema": esquema},
                },
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as error:  # red, credenciales, límites, 4xx…
            self.avisos.append(f"API no disponible ({error.__class__.__name__}: {error}); uso plantillas.")
            return None

        if respuesta.stop_reason == "refusal":
            self.avisos.append("El modelo declinó la petición; uso plantillas para este contenido.")
            return None
        if respuesta.stop_reason == "max_tokens":
            self.avisos.append("Respuesta truncada por max_tokens; sube 'modelo.max_tokens'.")

        texto = next((b.text for b in respuesta.content if b.type == "text"), "")
        try:
            return json.loads(texto)
        except json.JSONDecodeError:
            self.avisos.append("La respuesta no era JSON válido; uso plantillas.")
            return None


def _cliente():
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        return None
    try:
        import anthropic
    except ImportError:
        return None
    try:
        return anthropic.Anthropic()
    except Exception:
        return None


# --------------------------------------------------------------- prompts

def _sistema(persona: Persona) -> str:
    partes = [
        f"Eres el creador de contenido de «{persona.nombre}», una cuenta sobre {persona.nicho}.",
        f"Escribes en {persona.idioma} para {persona.audiencia}.",
        f"Tu tono es {persona.tono}.",
        "Escribes contenido original y honesto: nada de promesas imposibles, datos inventados,"
        " clickbait engañoso ni afirmaciones que no puedas sostener.",
        "Prefieres el detalle concreto a la frase motivacional genérica.",
    ]
    if persona.temas:
        partes.append("Temas habituales: " + ", ".join(persona.temas) + ".")
    if persona.evitar:
        partes.append("Evitas siempre: " + ", ".join(persona.evitar) + ".")
    return " ".join(partes)


def _prompt_ideas(cfg: Config, cantidad: int, evitar: list[str], aprendizajes: list[str]) -> str:
    formatos = ", ".join(_formatos(cfg))
    lineas = [
        f"Propón {cantidad} ideas de contenido nuevas para las próximas semanas.",
        f"Formatos disponibles: {formatos}.",
        "Cada idea debe ser específica y ejecutable: un ángulo concreto, no un tema genérico.",
        "Varía el tipo de idea: enseñar algo, romper un mito, contar un error propio,"
        " comparar dos opciones, responder una duda frecuente, mostrar un proceso.",
    ]
    if aprendizajes:
        lineas.append("Lo que mejor ha funcionado hasta ahora:\n- " + "\n- ".join(aprendizajes))
    if evitar:
        lineas.append("No repitas estas ideas ya publicadas o pendientes:\n- " + "\n- ".join(evitar[:40]))
    lineas.append("Devuelve el JSON con la lista de ideas. 'gancho' es la primera frase del contenido.")
    return "\n\n".join(lineas)


def _prompt_texto(cfg: Config, idea: Idea, esp: dict[str, Any]) -> str:
    persona = cfg.persona
    lineas = [
        f"Escribe la publicación para {esp['nombre']} en formato {esp['formato']}.",
        f"Idea: {idea.titulo}\nÁngulo: {idea.angulo or '—'}\nGancho sugerido: {idea.gancho or '—'}",
        f"Estilo propio de la red: {esp['estilo']}.",
        f"El texto completo (gancho + cuerpo + cta) no debe pasar de {esp['limite']} caracteres.",
        f"Máximo {esp['hashtags_max']} hashtags, en minúsculas y relevantes (sin '#' repetidos ni spam).",
        "'visual' describe en una o dos frases qué imagen o vídeo acompaña.",
        "'texto_alt' es la descripción accesible de ese visual (máx. 120 caracteres).",
    ]
    if persona.cta_por_defecto:
        lineas.append(f"Llamada a la acción de referencia (puedes reescribirla): {persona.cta_por_defecto}")
    return "\n\n".join(lineas)


# ------------------------------------------------------- motor de plantillas

APERTURAS = [
    "Nadie te lo cuenta así: {titulo}.",
    "{titulo}. Te explico en 30 segundos.",
    "Llevo tiempo dándole vueltas a esto: {titulo}.",
    "Si solo te llevas una cosa de hoy, que sea esta: {titulo}.",
    "Error que cometí durante meses: no entender {titulo}.",
]

CUERPOS = [
    "El problema no es la falta de información, es el orden.\n\n"
    "1. Empieza por lo que ya puedes medir.\n"
    "2. Cambia una sola variable cada semana.\n"
    "3. Anota el resultado aunque sea malo.\n\n"
    "{angulo}",
    "Lo que suele fallar:\n\n"
    "· Quieres resultados de tres meses en tres días.\n"
    "· Cambias de método antes de darle tiempo a funcionar.\n"
    "· No registras nada, así que no sabes qué te sirvió.\n\n"
    "{angulo}",
    "{angulo}\n\n"
    "En la práctica esto significa: elige lo mínimo que puedas sostener seis semanas seguidas "
    "y protégelo por encima de lo demás. Lo sofisticado viene después.",
]

CIERRES = [
    "¿Te ha pasado? Cuéntamelo en comentarios.",
    "Guarda esto y revísalo la semana que viene.",
    "Si te sirve, compártelo con quien lo necesite.",
]


def _ideas_plantilla(cfg: Config, cantidad: int, evitar: list[str]) -> list[Idea]:
    persona = cfg.persona
    temas = persona.temas or [persona.nicho]
    angulos = [
        "el error más común y cómo detectarlo a tiempo",
        "lo mínimo que funciona cuando no tienes tiempo",
        "qué medir para saber si vas bien",
        "el mito que más repite todo el mundo",
        "cómo empezar desde cero esta semana",
        "lo que yo haría distinto si volviera a empezar",
    ]
    formatos = _formatos(cfg)
    azar = random.Random(f"{persona.nombre}|{len(evitar)}")
    vistos = {normalizar(t) for t in evitar}
    ideas: list[Idea] = []
    intento = 0
    while len(ideas) < cantidad and intento < cantidad * 12:
        tema = temas[intento % len(temas)]
        angulo = angulos[(intento // max(len(temas), 1)) % len(angulos)]
        titulo = f"{tema.capitalize()}: {angulo}"
        intento += 1
        if normalizar(titulo) in vistos:
            continue
        vistos.add(normalizar(titulo))
        ideas.append(
            Idea(
                titulo=titulo,
                angulo=f"Enfoque práctico sobre {tema} centrado en {angulo}.",
                formato=azar.choice(formatos),
                gancho=APERTURAS[intento % len(APERTURAS)].format(titulo=titulo.lower()),
                temas=[tema],
            )
        )
    return ideas


def _texto_plantilla(cfg: Config, idea: Idea, esp: dict[str, Any]) -> dict[str, Any]:
    persona = cfg.persona
    azar = random.Random(slug(idea.titulo) + esp["nombre"])
    gancho = idea.gancho or azar.choice(APERTURAS).format(titulo=idea.titulo.lower())
    cuerpo = azar.choice(CUERPOS).format(
        angulo=idea.angulo or f"Aplicado a {persona.nicho}, esto es lo que más cambia el resultado."
    )
    etiquetas = [hashtag(t) for t in (idea.temas or persona.temas or [persona.nicho])]
    etiquetas.append(hashtag(persona.nicho))
    return {
        "gancho": gancho,
        "cuerpo": cuerpo,
        "cta": persona.cta_por_defecto or azar.choice(CIERRES),
        "hashtags": etiquetas,
        "visual": f"Plano cercano ilustrando «{idea.titulo}», con texto sobreimpreso del gancho.",
        "texto_alt": recortar(f"Imagen sobre {idea.titulo}", 120),
    }


# ------------------------------------------------------------------ utilidad

def _formatos(cfg: Config) -> list[str]:
    formatos = sorted({p.formato for p in cfg.activas() if p.formato})
    return formatos or ["post"]


def _formato_valido(cfg: Config, valor: Any) -> str:
    formatos = _formatos(cfg)
    candidato = normalizar(str(valor or ""))
    for formato in formatos:
        if normalizar(formato) == candidato:
            return formato
    return formatos[0]


def _mayuscula(texto: str) -> str:
    return texto[:1].upper() + texto[1:] if texto else texto


def _sanear(datos: dict[str, Any], esp: dict[str, Any], persona: Persona, motor: str) -> dict[str, Any]:
    """Normaliza y aplica los límites duros de la red."""
    limpio = {
        "gancho": _mayuscula(str(datos.get("gancho", "")).strip()),
        "cuerpo": str(datos.get("cuerpo", "")).strip(),
        "cta": str(datos.get("cta", "")).strip(),
        "visual": str(datos.get("visual", "")).strip(),
        "texto_alt": recortar(str(datos.get("texto_alt", "")).strip(), 120),
        "generado_por": motor,
    }
    if persona.firma and persona.firma not in limpio["cta"]:
        limpio["cta"] = f"{limpio['cta']} {persona.firma}".strip()

    etiquetas: list[str] = []
    for bruto in datos.get("hashtags") or []:
        etiqueta = hashtag(str(bruto))
        if etiqueta and etiqueta not in etiquetas:
            etiquetas.append(etiqueta)
    limpio["hashtags"] = etiquetas[: int(esp["hashtags_max"])]

    # Reserva sitio para las etiquetas dentro del límite de la red.
    largo_etiquetas = len(" ".join(limpio["hashtags"]))
    margen = max(int(esp["limite"]) - largo_etiquetas - 2, int(esp["limite"] * 0.5))
    fijo = len(limpio["gancho"]) + len(limpio["cta"]) + 4
    limpio["cuerpo"] = recortar(limpio["cuerpo"], max(margen - fijo, 80))
    return limpio
