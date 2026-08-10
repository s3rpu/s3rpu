"""Persistencia en SQLite: ideas, publicaciones, métricas y bitácora."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable

from .modelos import (
    BORRADOR,
    IDEA_PENDIENTE,
    IDEA_USADA,
    Idea,
    Metrica,
    Publicacion,
)
from .util import a_iso, ahora

ESQUEMA = """
CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    angulo TEXT DEFAULT '',
    formato TEXT DEFAULT 'post',
    temas TEXT DEFAULT '[]',
    gancho TEXT DEFAULT '',
    estado TEXT DEFAULT 'pendiente',
    creada_en TEXT NOT NULL,
    UNIQUE (titulo)
);

CREATE TABLE IF NOT EXISTS publicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id INTEGER REFERENCES ideas(id),
    plataforma TEXT NOT NULL,
    formato TEXT DEFAULT 'post',
    titulo TEXT DEFAULT '',
    gancho TEXT DEFAULT '',
    cuerpo TEXT DEFAULT '',
    cta TEXT DEFAULT '',
    hashtags TEXT DEFAULT '[]',
    visual TEXT DEFAULT '',
    texto_alt TEXT DEFAULT '',
    imagen_url TEXT DEFAULT '',
    estado TEXT DEFAULT 'borrador',
    generado_por TEXT DEFAULT '',
    intentos INTEGER DEFAULT 0,
    error TEXT DEFAULT '',
    programada_en TEXT NOT NULL,
    publicada_en TEXT DEFAULT '',
    externa_id TEXT DEFAULT '',
    url TEXT DEFAULT '',
    UNIQUE (plataforma, programada_en)
);

CREATE TABLE IF NOT EXISTS metricas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER NOT NULL REFERENCES publicaciones(id),
    capturada_en TEXT NOT NULL,
    impresiones INTEGER DEFAULT 0,
    alcance INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comentarios INTEGER DEFAULT 0,
    compartidos INTEGER DEFAULT 0,
    guardados INTEGER DEFAULT 0,
    clics INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    momento TEXT NOT NULL,
    nivel TEXT NOT NULL,
    etapa TEXT NOT NULL,
    mensaje TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pub_estado ON publicaciones(estado, programada_en);
CREATE INDEX IF NOT EXISTS idx_met_pub ON metricas(publicacion_id, capturada_en);
"""

_CAMPOS_PUB = [
    "idea_id", "plataforma", "formato", "titulo", "gancho", "cuerpo", "cta",
    "hashtags", "visual", "texto_alt", "imagen_url", "estado", "generado_por",
    "intentos", "error", "programada_en", "publicada_en", "externa_id", "url",
]


class Almacen:
    def __init__(self, ruta: str | Path = "influencer.db"):
        self.ruta = str(ruta)
        crear_dir = Path(self.ruta).parent
        if str(crear_dir) not in ("", "."):
            crear_dir.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(self.ruta)
        self.con.row_factory = sqlite3.Row
        self.con.execute("PRAGMA foreign_keys = ON")
        self.con.executescript(ESQUEMA)
        self.con.commit()

    def cerrar(self) -> None:
        self.con.close()

    def __enter__(self) -> "Almacen":
        return self

    def __exit__(self, *_: Any) -> None:
        self.cerrar()

    # ---------------------------------------------------------------- ideas

    def guardar_idea(self, idea: Idea) -> Idea:
        """Inserta la idea. Si el título ya existe, la ignora y la recupera."""
        idea.creada_en = idea.creada_en or a_iso(ahora())
        cur = self.con.execute(
            """INSERT OR IGNORE INTO ideas (titulo, angulo, formato, temas, gancho, estado, creada_en)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (idea.titulo, idea.angulo, idea.formato, json.dumps(idea.temas, ensure_ascii=False),
             idea.gancho, idea.estado, idea.creada_en),
        )
        self.con.commit()
        if cur.lastrowid and cur.rowcount:
            idea.id = cur.lastrowid
            return idea
        fila = self.con.execute("SELECT * FROM ideas WHERE titulo = ?", (idea.titulo,)).fetchone()
        return _idea(fila)

    def ideas(self, estado: str | None = None, limite: int = 0) -> list[Idea]:
        sql = "SELECT * FROM ideas"
        params: list[Any] = []
        if estado:
            sql += " WHERE estado = ?"
            params.append(estado)
        sql += " ORDER BY id"
        if limite:
            sql += f" LIMIT {int(limite)}"
        return [_idea(f) for f in self.con.execute(sql, params)]

    def idea(self, idea_id: int | None) -> Idea | None:
        if not idea_id:
            return None
        fila = self.con.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
        return _idea(fila) if fila else None

    def contar_ideas(self, estado: str = IDEA_PENDIENTE) -> int:
        fila = self.con.execute("SELECT COUNT(*) c FROM ideas WHERE estado = ?", (estado,)).fetchone()
        return int(fila["c"])

    def marcar_idea(self, idea_id: int, estado: str = IDEA_USADA) -> None:
        self.con.execute("UPDATE ideas SET estado = ? WHERE id = ?", (estado, idea_id))
        self.con.commit()

    def titulos_ideas(self) -> list[str]:
        return [f["titulo"] for f in self.con.execute("SELECT titulo FROM ideas ORDER BY id DESC LIMIT 60")]

    # --------------------------------------------------------- publicaciones

    def guardar_publicacion(self, pub: Publicacion) -> Publicacion:
        valores = _valores_pub(pub)
        if pub.id:
            asignaciones = ", ".join(f"{c} = ?" for c in _CAMPOS_PUB)
            self.con.execute(
                f"UPDATE publicaciones SET {asignaciones} WHERE id = ?",
                [valores[c] for c in _CAMPOS_PUB] + [pub.id],
            )
            self.con.commit()
            return pub
        cur = self.con.execute(
            f"""INSERT OR IGNORE INTO publicaciones ({", ".join(_CAMPOS_PUB)})
                VALUES ({", ".join("?" for _ in _CAMPOS_PUB)})""",
            [valores[c] for c in _CAMPOS_PUB],
        )
        self.con.commit()
        if cur.rowcount:
            pub.id = cur.lastrowid
            return pub
        fila = self.con.execute(
            "SELECT * FROM publicaciones WHERE plataforma = ? AND programada_en = ?",
            (pub.plataforma, pub.programada_en),
        ).fetchone()
        return _publicacion(fila)

    def publicaciones(
        self,
        estados: Iterable[str] | None = None,
        hasta: str | None = None,
        limite: int = 0,
    ) -> list[Publicacion]:
        sql = "SELECT * FROM publicaciones"
        condiciones: list[str] = []
        params: list[Any] = []
        if estados:
            estados = list(estados)
            condiciones.append(f"estado IN ({', '.join('?' for _ in estados)})")
            params.extend(estados)
        if hasta:
            condiciones.append("programada_en <= ?")
            params.append(hasta)
        if condiciones:
            sql += " WHERE " + " AND ".join(condiciones)
        sql += " ORDER BY programada_en"
        if limite:
            sql += f" LIMIT {int(limite)}"
        return [_publicacion(f) for f in self.con.execute(sql, params)]

    def publicacion(self, pub_id: int) -> Publicacion | None:
        fila = self.con.execute("SELECT * FROM publicaciones WHERE id = ?", (pub_id,)).fetchone()
        return _publicacion(fila) if fila else None

    def huecos_ocupados(self) -> set[tuple[str, str]]:
        return {
            (f["plataforma"], f["programada_en"])
            for f in self.con.execute("SELECT plataforma, programada_en FROM publicaciones")
        }

    # ------------------------------------------------------------- métricas

    def guardar_metrica(self, metrica: Metrica) -> None:
        self.con.execute(
            """INSERT INTO metricas (publicacion_id, capturada_en, impresiones, alcance,
                                     likes, comentarios, compartidos, guardados, clics)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (metrica.publicacion_id, metrica.capturada_en, metrica.impresiones, metrica.alcance,
             metrica.likes, metrica.comentarios, metrica.compartidos, metrica.guardados, metrica.clics),
        )
        self.con.commit()

    def ultimas_metricas(self) -> dict[int, Metrica]:
        """La captura más reciente de cada publicación."""
        filas = self.con.execute(
            """SELECT m.* FROM metricas m
               JOIN (SELECT publicacion_id, MAX(capturada_en) mx
                     FROM metricas GROUP BY publicacion_id) u
                 ON u.publicacion_id = m.publicacion_id AND u.mx = m.capturada_en
               GROUP BY m.publicacion_id"""
        )
        return {f["publicacion_id"]: _metrica(f) for f in filas}

    # -------------------------------------------------------------- eventos

    def registrar(self, etapa: str, mensaje: str, nivel: str = "info") -> None:
        self.con.execute(
            "INSERT INTO eventos (momento, nivel, etapa, mensaje) VALUES (?, ?, ?, ?)",
            (a_iso(ahora()), nivel, etapa, mensaje),
        )
        self.con.commit()

    def eventos(self, limite: int = 30) -> list[sqlite3.Row]:
        return list(
            self.con.execute("SELECT * FROM eventos ORDER BY id DESC LIMIT ?", (int(limite),))
        )


def _idea(fila: sqlite3.Row) -> Idea:
    return Idea(
        id=fila["id"],
        titulo=fila["titulo"],
        angulo=fila["angulo"],
        formato=fila["formato"],
        temas=json.loads(fila["temas"] or "[]"),
        gancho=fila["gancho"],
        estado=fila["estado"],
        creada_en=fila["creada_en"],
    )


def _publicacion(fila: sqlite3.Row) -> Publicacion:
    datos = {c: fila[c] for c in fila.keys()}
    datos["hashtags"] = json.loads(datos.get("hashtags") or "[]")
    return Publicacion(**datos)


def _metrica(fila: sqlite3.Row) -> Metrica:
    return Metrica(
        publicacion_id=fila["publicacion_id"],
        capturada_en=fila["capturada_en"],
        impresiones=fila["impresiones"],
        alcance=fila["alcance"],
        likes=fila["likes"],
        comentarios=fila["comentarios"],
        compartidos=fila["compartidos"],
        guardados=fila["guardados"],
        clics=fila["clics"],
    )


def _valores_pub(pub: Publicacion) -> dict[str, Any]:
    datos = pub.dict()
    datos["hashtags"] = json.dumps(pub.hashtags, ensure_ascii=False)
    datos.setdefault("estado", BORRADOR)
    return datos
