import { app, BrowserWindow } from 'electron';
import './server/index.js';

function createWindow () {
  const win = new BrowserWindow({
    width: 1250,
    height: 900,
    title: "Domain User Provisioner",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Give Express 1 second to bind its underlying routing engine over the localhost proxy natively
  setTimeout(() => {
    win.loadURL('http://localhost:3001');
  }, 1000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});
