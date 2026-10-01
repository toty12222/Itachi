const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
let serverInstance = null;

const PORT = process.env.PORT || 3001;

function startExpress() {
    try {
        const expressApp = require('./server.js');
        serverInstance = expressApp.server || null;
        console.log('[Electron] Servidor Express iniciado.');
    } catch (err) {
        console.error('[Electron] Erro ao carregar server.js:', err);
    }
}

function waitForServer(url, timeout = 12000) {
    const start = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            http.get(url, (res) => {
                resolve();
            }).on('error', () => {
                if (Date.now() - start > timeout) {
                    resolve(); // prossegue mesmo se timeout
                } else {
                    setTimeout(check, 250);
                }
            });
        };
        check();
    });
}

async function createWindow() {
    const iconPath = path.join(__dirname, 'public', 'netprofiles.ico');

    mainWindow = new BrowserWindow({
        width: 1366,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        title: 'NetProfiles - Filmes, Séries e TV ao Vivo',
        icon: iconPath,
        backgroundColor: '#111111',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            webSecurity: false // Permite que players externos e iframes de streaming rodem sem bloqueios de X-Frame-Options
        }
    });

    // Bloquear popups indesejados e aberturas de abas por parte de players de vídeo e anúncios
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Nega abertura de novas janelas para manter o usuário sempre dentro da interface do app
        return { action: 'deny' };
    });

    const targetUrl = `http://127.0.0.1:${PORT}`;
    await waitForServer(targetUrl);
    await mainWindow.loadURL(targetUrl);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Garantir instância única do aplicativo
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        // Bloquear requisições para ad-networks conhecidas (popups, redirects, trackers)
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            const url = (details.url || '').toLowerCase();
            const adDomains = [
                'popads.net', 'popcash.net', 'exoclick.com', 'trafficjunky.com',
                'propellerads.com', 'monetag.com', 'adsterra.com', 'bet365',
                '1xbet', 'doubleclick.net', 'googlesyndication.com', 'adnxs.com',
                'juicyads.com', 'onclickalgo.com', 'onclicksuper.com', 'hilltopads.com',
                'ad-maven.com', 'clickadu.com', 'histats.com', 'adkeeper.co.uk'
            ];
            const isAd = adDomains.some(domain => url.includes(domain));
            if (isAd) {
                return callback({ cancel: true });
            }
            callback({ cancel: false });
        });

        // Interceptar cabeçalhos para evitar bloqueios 403 Forbidden nos players de canais e esportes
        session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
            const url = details.url.toLowerCase();
            const headers = { ...details.requestHeaders };

            if (url.includes('bolodechocolate.fit') || url.includes('rdcanais.net') || url.includes('pescaplay.store') || url.includes('satlabscloud.com.br')) {
                headers['Referer'] = 'https://rdcanais.net/';
                headers['Origin'] = 'https://rdcanais.net';
                headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
            } else if (url.includes('playerflix.ink') || url.includes('myembed.biz')) {
                headers['Referer'] = 'https://myembed.biz/';
                headers['Origin'] = 'https://myembed.biz';
            } else if (url.includes('esportesembed.net') || url.includes('reidoscanais.st') || url.includes('cdn-img.st') || url.includes('localhost.tattoo') || url.includes('pqpstream.online')) {
                headers['Referer'] = 'https://reidoscanais.st/';
                headers['Origin'] = 'https://reidoscanais.st';
                headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
            }

            callback({ cancel: false, requestHeaders: headers });
        });

        // Remover restrições de iframe (X-Frame-Options e CSP) APENAS para os domínios
        // dos players de streaming conhecidos — mantém proteções para todos os outros recursos
        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            const url = (details.url || '').toLowerCase();
            const streamingDomains = [
                'myembed.biz', 'vidsrc', 'embed.su', 'multiembed', 'superembed',
                'rdcanais.net', 'bolodechocolate.fit', 'playerflix.ink',
                'esportesembed.net', 'pescaplay.store', 'cdn-img.st',
                'localhost.tattoo', 'pqpstream.online', 'satlabscloud.com.br',
                'reidoscanais.st', 'youtube.com', 'ytimg.com'
            ];
            const isStreaming = streamingDomains.some(d => url.includes(d));

            const responseHeaders = { ...details.responseHeaders };

            if (isStreaming) {
                // Para players de streaming: remover restrições de iframe e CORS
                delete responseHeaders['x-frame-options'];
                delete responseHeaders['X-Frame-Options'];
                delete responseHeaders['content-security-policy'];
                delete responseHeaders['Content-Security-Policy'];
                responseHeaders['access-control-allow-origin'] = ['*'];
                responseHeaders['access-control-allow-credentials'] = ['true'];
            }

            callback({ responseHeaders });
        });


        startExpress();
        await createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            if (serverInstance && typeof serverInstance.close === 'function') {
                serverInstance.close();
            }
            app.quit();
        }
    });

    app.on('before-quit', () => {
        if (serverInstance && typeof serverInstance.close === 'function') {
            serverInstance.close();
        }
    });
}
