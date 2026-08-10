"""Telegram y Discord: canales propios, sin métricas públicas."""

from __future__ import annotations

from ..modelos import Publicacion, ResultadoPublicacion
from .base import Publicador, pedir


class Telegram(Publicador):
    """Bot API. Credenciales: token, chat_id."""

    clave = "telegram"
    requiere = ("token", "chat_id")

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        token = self.credencial("token")
        datos = pedir(
            "POST",
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={
                "chat_id": self.credencial("chat_id"),
                "text": self.texto(publicacion),
                "disable_web_page_preview": True,
            },
        )
        resultado = datos.get("result", {})
        mensaje_id = str(resultado.get("message_id", ""))
        chat = resultado.get("chat", {}) or {}
        usuario = chat.get("username")
        url = f"https://t.me/{usuario}/{mensaje_id}" if usuario and mensaje_id else ""
        return ResultadoPublicacion(ok=True, externa_id=mensaje_id, url=url)


class Discord(Publicador):
    """Webhook de canal. Credenciales: webhook."""

    clave = "discord"
    requiere = ("webhook",)

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        datos = pedir(
            "POST",
            self.credencial("webhook"),
            params={"wait": "true"},
            json={"content": self.texto(publicacion)},
        )
        return ResultadoPublicacion(ok=True, externa_id=str(datos.get("id", "")))
