# Resumen para boletín / newsletter

**Modelo:** `anthropic.claude-sonnet-5` · **effort:** `medium`
**Entrada:** todas las piezas aprobadas de un periodo.
**Salida:** un bloque por acuerdo, para montar el boletín.

---

```
Prepara la entrada de boletín municipal para cada uno de estos acuerdos ya
aprobados.

{{piezas_aprobadas}}

Para cada uno:
- Un titular de menos de 10 palabras.
- Dos o tres frases con lo esencial: qué se aprobó y a quién afecta.

Van seguidos en un mismo boletín, así que no empieces todos igual.

No añadas nada que no esté en las piezas de entrada: ya han pasado revisión
humana y son la versión buena del hecho.

Devuelve un bloque por acuerdo separados por una línea `---`.
```
