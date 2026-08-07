// Copia los archivos de la app web (../index.html, ../css, ../js) a ./app
// antes de empaquetar, para no duplicar el código fuente en el repositorio
// y que el instalable siempre lleve la versión más reciente de la app.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(__dirname, 'app');

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const item of ['index.html', 'css', 'js']) {
  fs.cpSync(path.join(root, item), path.join(dest, item), { recursive: true });
}

console.log('App copiada a electron/app/');
