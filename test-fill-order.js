/**
 * Test: Simulate EXACTLY what happens when user clicks "Fill Order"
 * from the browser, but using HTTP request directly.
 * 
 * This tests whether the server RESPONDS at all.
 */
const http = require('http');
const jwt = require('jsonwebtoken');
const jwtConfig = require('./config/jwt');

// Generate a valid JWT token for user 2
const token = jwt.sign({ userId: 2 }, jwtConfig.secret, { expiresIn: '1h' });

// First, get the list of active orders
function getActiveOrders() {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:3000/api/test-orders', (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve([]);
                }
            });
        }).on('error', reject);
    });
}

// Make a fill-order POST request
function fillOrder(orderId) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ orderId });
        const startTime = Date.now();
        
        console.log(`[${new Date().toISOString()}] Sending fill-order for: ${orderId}`);
        
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/fill-order',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': `token=${token}`,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 20000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                const elapsed = Date.now() - startTime;
                console.log(`[${new Date().toISOString()}] Response (${elapsed}ms): STATUS ${res.statusCode}`);
                console.log(`[${new Date().toISOString()}] Body: ${data}`);
                try {
                    resolve(JSON.parse(data));
                } catch(e) {
                    resolve({ raw: data });
                }
            });
        });
        
        req.on('error', (e) => {
            const elapsed = Date.now() - startTime;
            console.error(`[${new Date().toISOString()}] Request ERROR (${elapsed}ms):`, e.message);
            reject(e);
        });
        
        req.on('timeout', () => {
            const elapsed = Date.now() - startTime;
            console.error(`[${new Date().toISOString()}] Request TIMEOUT (${elapsed}ms)`);
            req.destroy();
            reject(new Error('timeout'));
        });
        
        req.write(postData);
        req.end();
    });
}

async function main() {
    console.log('=== Fill-Order HTTP Test ===\n');
    
    // Get active orders
    const orders = await getActiveOrders();
    console.log(`Found ${orders.length} active orders`);
    
    if (orders.length === 0) {
        console.log('No orders to fill. Testing with fake orderId to see if server responds...');
        try {
            const result = await fillOrder('nonexistent-order-id');
            console.log('Server responded to invalid order:', result);
        } catch(e) {
            console.error('Server FAILED to respond:', e.message);
        }
    } else {
        const orderId = orders[0].id;
        console.log(`Attempting to fill order: ${orderId}`);
        try {
            const result = await fillOrder(orderId);
            console.log('Fill order result:', result);
        } catch(e) {
            console.error('Fill order FAILED:', e.message);
        }
    }
    
    process.exit();
}

main();
