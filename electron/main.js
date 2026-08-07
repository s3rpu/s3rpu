const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Se muestra (y se le da el foco explícitamente) solo cuando el contenido
  // ya está listo, en vez de con la ventana ya creada con show:true por
  // defecto. Sin esto, en Windows a veces la ventana se abre sin el foco
  // real del sistema, y el primer clic solo activa la ventana en vez de
  // llegar al campo — hay que pulsar dos veces para poder escribir.
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
