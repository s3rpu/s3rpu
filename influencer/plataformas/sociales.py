"""Redes sociales públicas: Mastodon, X, LinkedIn e Instagram."""

from __future__ import annotations

from ..modelos import Metrica, Publicacion, ResultadoPublicacion
from .base import FaltanCredenciales, Publicador, pedir

VERSION_GRAPH = "v21.0"


class Mastodon(Publicador):
    """Credenciales: instancia (https://…), token."""

    clave = "mastodon"
    requiere = ("instancia", "token")
    con_metricas = True

    def _base(self) -> str:
        return self.credencial("instancia").rstrip("/")

    def _cabeceras(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.credencial('token')}"}

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        datos = pedir(
            "POST",
            f"{self._base()}/api/v1/statuses",
            headers=self._cabeceras(),
            json={"status": self.texto(publicacion), "language": "es"},
        )
        return ResultadoPublicacion(
            ok=True, externa_id=str(datos.get("id", "")), url=str(datos.get("url", ""))
        )

    def metricas(self, publicacion: Publicacion) -> Metrica | None:
        if not publicacion.externa_id:
            return None
        datos = pedir(
            "GET",
            f"{self._base()}/api/v1/statuses/{publicacion.externa_id}",
            headers=self._cabeceras(),
        )
        return self._metrica(
            publicacion,
            likes=datos.get("favourites_count"),
            compartidos=datos.get("reblogs_count"),
            comentarios=datos.get("replies_count"),
        )


class X(Publicador):
    """API v2 con token OAuth 2.0 de usuario. Credenciales: token."""

    clave = "x"
    requiere = ("token",)
    con_metricas = True

    def _cabeceras(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.credencial('token')}"}

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        datos = pedir(
            "POST",
            "https://api.x.com/2/tweets",
            headers=self._cabeceras(),
            json={"text": self.texto(publicacion)},
        )
        identificador = str((datos.get("data") or {}).get("id", ""))
        usuario = self.credenciales.get("usuario", "i")
        url = f"https://x.com/{usuario}/status/{identificador}" if identificador else ""
        return ResultadoPublicacion(ok=True, externa_id=identificador, url=url)

    def metricas(self, publicacion: Publicacion) -> Metrica | None:
        if not publicacion.externa_id:
            return None
        datos = pedir(
            "GET",
            f"https://api.x.com/2/tweets/{publicacion.externa_id}",
            headers=self._cabeceras(),
            params={"tweet.fields": "public_metrics"},
        )
        publicas = ((datos.get("data") or {}).get("public_metrics") or {})
        return self._metrica(
            publicacion,
            impresiones=publicas.get("impression_count"),
            likes=publicas.get("like_count"),
            comentarios=publicas.get("reply_count"),
            compartidos=publicas.get("retweet_count"),
        )


class LinkedIn(Publicador):
    """Credenciales: token, autor (urn:li:person:XXXX o urn:li:organization:XXXX)."""

    clave = "linkedin"
    requiere = ("token", "autor")

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        cuerpo = {
            "author": self.credencial("autor"),
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": self.texto(publicacion)},
                    "shareMediaCategory": "NONE",
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }
        datos = pedir(
            "POST",
            "https://api.linkedin.com/v2/ugcPosts",
            headers={
                "Authorization": f"Bearer {self.credencial('token')}",
                "X-Restli-Protocol-Version": "2.0.0",
                "Content-Type": "application/json",
            },
            json=cuerpo,
        )
        identificador = str(datos.get("id", ""))
        return ResultadoPublicacion(ok=True, externa_id=identificador)


class Instagram(Publicador):
    """Graph API. Credenciales: token, usuario_id (IG User ID de empresa/creador).

    Instagram exige una imagen o vídeo alojado en una URL pública: se toma de
    ``publicacion.imagen_url`` o, si no hay, de la credencial ``imagen_defecto``.
    """

    clave = "instagram"
    requiere = ("token", "usuario_id")
    con_metricas = True

    def publicar(self, publicacion: Publicacion) -> ResultadoPublicacion:
        token = self.credencial("token")
        usuario = self.credencial("usuario_id")
        imagen = publicacion.imagen_url or self.credenciales.get("imagen_defecto", "")
        if not imagen:
            raise FaltanCredenciales(
                "Instagram necesita una imagen: rellena 'imagen_url' en la publicación "
                "o 'imagen_defecto' en las credenciales."
            )
        contenedor = pedir(
            "POST",
            f"https://graph.facebook.com/{VERSION_GRAPH}/{usuario}/media",
            data={
                "image_url": imagen,
                "caption": self.texto(publicacion),
                "alt_text": publicacion.texto_alt or "",
                "access_token": token,
            },
        )
        creacion = str(contenedor.get("id", ""))
        if not creacion:
            raise RuntimeError("Instagram no devolvió el contenedor de medios.")
        publicado = pedir(
            "POST",
            f"https://graph.facebook.com/{VERSION_GRAPH}/{usuario}/media_publish",
            data={"creation_id": creacion, "access_token": token},
        )
        identificador = str(publicado.get("id", ""))
        return ResultadoPublicacion(ok=True, externa_id=identificador)

    def metricas(self, publicacion: Publicacion) -> Metrica | None:
        if not publicacion.externa_id:
            return None
        datos = pedir(
            "GET",
            f"https://graph.facebook.com/{VERSION_GRAPH}/{publicacion.externa_id}/insights",
            params={
                "metric": "impressions,reach,likes,comments,saved,shares",
                "access_token": self.credencial("token"),
            },
        )
        valores: dict[str, int] = {}
        for entrada in datos.get("data") or []:
            serie = entrada.get("values") or [{}]
            valores[entrada.get("name", "")] = int(serie[0].get("value", 0) or 0)
        return self._metrica(
            publicacion,
            impresiones=valores.get("impressions"),
            alcance=valores.get("reach"),
            likes=valores.get("likes"),
            comentarios=valores.get("comments"),
            guardados=valores.get("saved"),
            compartidos=valores.get("shares"),
        )
