# Directorio de Contactos — versión de escritorio (Windows)

Empaqueta la misma app web (`../index.html`, `../css`, `../js`) como programa
de escritorio con Electron, para instalarla en un ordenador sin necesidad de
abrir el navegador manualmente. Los datos se siguen guardando igual (en el
propio ordenador), solo cambia cómo se abre la app.

## Compilar

```
npm install
npm run build:win
```

Genera en `dist/`:

- `Directorio de Contactos Setup 1.0.0.exe` — instalador (crea acceso directo
  en el escritorio y en el menú de inicio).
- `Directorio de Contactos 1.0.0.exe` — versión portable, no requiere
  instalación, se ejecuta directamente.

`copy-app.js` copia siempre la versión más reciente de `../index.html`,
`../css` y `../js` a `app/` antes de compilar, así que no hay que mantener
dos copias del código.
