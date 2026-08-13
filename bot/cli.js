const readline = require('readline');
const KuotaxBotEngine = require('./botEngine');

const bot = new KuotaxBotEngine();

console.log('\x1b[36m%s\x1b[0m', '================================================');
console.log('\x1b[32m%s\x1b[0m', '🚀 KUOTAX AUTO-ORDER BOT (LIGHTWEIGHT CLI)');
console.log('\x1b[36m%s\x1b[0m', '================================================');

bot.on('log', (item) => {
    const time = `[${item.timestamp}]`;
    if (item.type === 'success') {
        console.log('\x1b[32m%s\x1b[0m', `${time} ✅ ${item.message}`);
    } else if (item.type === 'error') {
        console.log('\x1b[31m%s\x1b[0m', `${time} ❌ ${item.message}`);
    } else if (item.type === 'warn') {
        console.log('\x1b[33m%s\x1b[0m', `${time} ⚠️ ${item.message}`);
    } else {
        console.log('\x1b[36m%s\x1b[0m', `${time} ℹ️ ${item.message}`);
    }
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const cfg = bot.config;
const defaultUrl = cfg.targetUrl || 'https://kuotax.web.id';
const defaultEmail = cfg.email || '';

rl.question(`Target URL [default: ${defaultUrl}]: `, (inputUrl) => {
    const url = inputUrl.trim() || defaultUrl;

    rl.question(`Email [default: ${defaultEmail}]: `, (inputEmail) => {
        const email = inputEmail.trim() || defaultEmail;

        rl.question(`Password: `, (password) => {
            rl.close();

            if (!email || !password) {
                console.log('\x1b[31m%s\x1b[0m', 'Error: Email dan password tidak boleh kosong!');
                process.exit(1);
            }

            bot.start(email, password, url).catch((err) => {
                console.log('\x1b[31m%s\x1b[0m', 'Gagal menjalankan bot: ' + err.message);
                process.exit(1);
            });
        });
    });
});
