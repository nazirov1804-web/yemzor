const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");

const appUrl = new URL(
  process.env.YEMZOR_APP_URL || "https://yemzor.duckdns.org",
);
appUrl.searchParams.set("app", "desktop");

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../public/yemzor.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (["http:", "https:"].includes(new URL(url).protocol)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== appUrl.origin) event.preventDefault();
  });

  void window.loadURL(appUrl.toString());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
