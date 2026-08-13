const http = require('http');
const fs = require('fs');
const path = require('path');
const KuotaxBotEngine = require('./botEngine');

const bot = new KuotaxBotEngine();
const PORT = process.env.BOT_PORT || bot.config.webPort || 4000;

// SSE Client Connections for Realtime Log Stream
const sseClients = new Set();

bot.on('log', (logItem) => {
    // Print to console
    const time = `[${logItem.timestamp}]`;
    const prefix = logItem.type === 'success' ? '✅' : logItem.type === 'error' ? '❌' : logItem.type === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`${time} ${prefix} ${logItem.message}`);

    // Broadcast SSE log event to Web UI
    const payload = `data: ${JSON.stringify({ type: 'log', data: logItem })}\n\n`;
    for (const client of sseClients) {
        client.write(payload);
    }
});

bot.on('status-update', (status) => {
    const payload = `data: ${JSON.stringify({ type: 'status', data: status })}\n\n`;
    for (const client of sseClients) {
        client.write(payload);
    }
});

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    // 1. API: SSE Log & Status Stream
    if (url.pathname === '/api/stream') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        
        // Send initial status
        res.write(`data: ${JSON.stringify({ type: 'status', data: bot.getStatus() })}\n\n`);
        sseClients.add(res);

        req.on('close', () => {
            sseClients.delete(res);
        });
        return;
    }

    // 2. API: Get Bot Status
    if (url.pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(bot.getStatus()));
    }

    // 3. API: Start Bot
    if (url.pathname === '/api/start' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const payload = body ? JSON.parse(body) : {};
                await bot.start(payload.email, payload.password, payload.targetUrl);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Bot berhasil diaktifkan!', status: bot.getStatus() }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: err.message }));
            }
        });
        return;
    }

    // 4. API: Stop Bot
    if (url.pathname === '/api/stop' && req.method === 'POST') {
        bot.stop();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, message: 'Bot berhasil dihentikan.', status: bot.getStatus() }));
    }

    // 5. API: Save Config
    if (url.pathname === '/api/config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                bot.saveConfig(payload);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'Pengaturan disimpan.' }));
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: err.message }));
            }
        });
        return;
    }

    // 6. Serve Static Files from /public
    let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'text/html';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // Fallback to index.html
                fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, fallbackContent) => {
                    if (e) {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('404 Not Found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(fallbackContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('\x1b[36m%s\x1b[0m', '================================================');
    console.log('\x1b[32m%s\x1b[0m', `🤖 KUOTAX AUTO-ORDER BOT CONTROL PANEL`);
    console.log('\x1b[36m%s\x1b[0m', '================================================');
    console.log('\x1b[33m%s\x1b[0m', `🌐 Dashboard Web UI : http://localhost:${PORT}`);
    console.log('\x1b[36m%s\x1b[0m', '================================================');

    if (bot.config.autoStart && bot.config.email && bot.config.password) {
        console.log('\x1b[32m%s\x1b[0m', '⚡ AutoStart aktif! Memulai bot otomatis...');
        bot.start().catch(e => console.error('AutoStart error:', e.message));
    }
});
