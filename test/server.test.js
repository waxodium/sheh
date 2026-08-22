const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const test = require('node:test');

const { startServer } = require('../src/server.js');

async function stop(server) {
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

test('server listens on loopback by default', async (t) => {
    const server = startServer();
    t.after(() => stop(server));

    await once(server, 'listening');
    assert.equal(server.address().address, '127.0.0.1');
});

test('network mode listens on every IPv4 interface', async (t) => {
    const server = startServer({ network: true });
    t.after(() => stop(server));

    await once(server, 'listening');
    assert.equal(server.address().address, '0.0.0.0');
});

test('CLI documents the explicit network option', () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'main.js'), '--help'], {
        encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--network\s+Expose the server to the local network/);
});
