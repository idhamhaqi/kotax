const http = require('http');

const req = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/test-orders',
    method: 'GET',
    timeout: 2000
}, (res) => {
    let d='';
    res.on('data', c => d+=c);
    res.on('end', () => console.log('STATUS:', res.statusCode, 'DATA:', d));
});
req.on('timeout', () => console.log('TIMEOUT!'));
req.on('error', (e) => console.log('ERROR:', e.message));
req.end();
