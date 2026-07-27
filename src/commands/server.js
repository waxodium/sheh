const http = require('http');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');

const processModule = require('@waxory/sheh/getshell');
const shellName = processModule.getShell();

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

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

module.exports = function(context, args) {

    const PUBLIC_DIR = path.resolve(context.root, "public");

    function serveStatic(req, res) {
        const reqUrl = req.url.split('?')[0];
        let safePath = reqUrl === '/' ? '/index.html' : reqUrl;

        const relativePath = path.normalize(safePath).replace(/^(\/|\\)+/, '');
        const filePath = path.join(PUBLIC_DIR, relativePath);

        if (!filePath.startsWith(PUBLIC_DIR)) {
            res.writeHead(403);
            res.end('403 Forbidden');
            return;
        }

        fs.stat(filePath, function(err, stats) {
            if (err || !stats.isFile()) {
                res.writeHead(404);
                res.end('404 Not Found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': stats.size
            });

            fs.createReadStream(filePath).pipe(res);
        });
    }

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
        if (buffer.length < 2) return null;

        const secondByte = buffer[1];
        const masked = (secondByte & 0x80) === 0x80;
        let dataLength = secondByte & 0x7f;
        let offset = 2;

        if (dataLength === 126) {
            if (buffer.length < 4) return null;
            dataLength = buffer.readUInt16BE(2);
            offset = 4;
        } else if (dataLength === 127) {
            if (buffer.length < 10) return null;
            dataLength = Number(buffer.readBigUInt64BE(2));
            offset = 10;
        }

        let maskingKey;

        if (masked) {
            if (buffer.length < offset + 4) return null;
            maskingKey = buffer.subarray(offset, offset + 4);
            offset += 4;
        }   

        if (buffer.length < offset + dataLength) return null;

        const frameData = Buffer.from(
            buffer.subarray(offset, offset + dataLength)
        );

        if (masked && maskingKey) {
            for (let i = 0; i < frameData.length; i++) {
                frameData[i] ^= maskingKey[i % 4];
            }
        }

        return frameData;
    }

    function startServer(port = 8080) {
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
                if (!message) return;

                const data = message.toString();

                if (data.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                            shell.resize(parsed.cols, parsed.rows);
                        }
                    } catch (error) {}
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

        server.once('error', function (error) {
            if (error.code === 'EADDRINUSE') {
                startServer(port + 1);
                return;
            }

            throw error;
        });

        server.listen(port, '0.0.0.0', function () {
            const networkDetails = Object.values(os.networkInterfaces()).flat();

            const network = networkDetails.find(
                details =>
                    details.family === 'IPv4' &&
                    details.internal === false
            );

            const assigned = server.address().port;

            let address = 'localhost';

            if (network) {
                address = network.address;
            }

            const coralGreen = '\x1b[38;5;167m';
            const lowerGreen = '\x1b[38;2;180;210;170m';
            const dimWhite = '\x1b[2m';
            const reset = '\x1b[0m';
            const bold = '\x1b[1m';

            console.log(`
${bold}Shell Exposed HTTP${reset}
${dimWhite}Status:${coralGreen} Online ${reset}
${dimWhite}Port:${coralGreen} ${assigned}${reset}

${lowerGreen}Local:${reset} http://localhost:${coralGreen}${assigned}${reset}
${lowerGreen}Network:${reset} http://${address}:${coralGreen}${assigned}${reset}
            `);
        });
    }

    startServer();
};
