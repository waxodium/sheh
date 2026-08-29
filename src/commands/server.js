const http = require('http');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const pty = require('node-pty');
const process_module = require('@waxory/sheh/getshell');

const shell_name = process_module.getShell();
const guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const mime_types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function serve_static(dir, request, response) {
    const url = request.url.split('?')[0];
    const safe_path = url === '/' ? '/index.html' : url;
    const file_path = path.join(dir, path.normalize(safe_path).replace(/^(\/|\\)+/, ''));

    if (!file_path.startsWith(dir)) {
        response.writeHead(403).end('403 Forbidden');
        return;
    }

    fs.stat(file_path, (error, stat) => {
        if (error || !stat.isFile()) {
            response.writeHead(404).end('404 Not Found');
            return;
        }

        const ext = path.extname(file_path).toLowerCase();
        response.writeHead(200, {
            'Content-Type': mime_types[ext] || 'application/octet-stream',
            'Content-Length': stat.size
        });
        fs.createReadStream(file_path).pipe(response);
    });
}

function build_frame(data) {
    const len = data.length;
    let header;

    if (len <= 125) {
        header = Buffer.from([0x81, len]);
    } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }

    return Buffer.concat([header, data]);
}

function parse_frame(buf) {
    if (buf.length < 2) return null;

    const is_masked = (buf[1] & 0x80) === 0x80;
    let len = buf[1] & 0x7f;
    let offset = 2;

    if (len === 126) {
        if (buf.length < 4) return null;
        len = buf.readUInt16BE(2);
        offset = 4;
    } else if (len === 127) {
        if (buf.length < 10) return null;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
    }

    let mask;
    if (is_masked) {
        if (buf.length < offset + 4) return null;
        mask = buf.subarray(offset, offset + 4);
        offset += 4;
    }

    if (buf.length < offset + len) return null;

    const data = Buffer.from(buf.subarray(offset, offset + len));
    if (is_masked && mask) {
        for (let i = 0; i < data.length; i++) {
            data[i] ^= mask[i % 4];
        }
    }

    return data;
}

function get_ip() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            const is_ipv4 = net.family === 'IPv4' || net.family === 4;
            if (is_ipv4 && !net.internal) return net.address;
        }
    }
    return 'localhost';
}



module.exports = {
    options: {
        port: {
            type: "string",
            alias: "p",
            default: "8080",
            validate: (val) => {
                const num = Number(val);
                if (isNaN(num) || num < 1 || num > 65535) {
                    return "Port must be a valid number between 1 and 65535.";
                }
            }
        }
    },

    run(context, args, flags) {
        const public_dir = path.resolve(context.root, "public");

        function start_server(port) {
            const server = http.createServer((req, res) => serve_static(public_dir, req, res));

            server.on('upgrade', (req, socket) => {
                const key = req.headers['sec-websocket-key'];
                if (!key) return socket.destroy();

                const accept_key = crypto.createHash('sha1').update(key + guid).digest('base64');
                const headers = [
                    'HTTP/1.1 101 Switching Protocols',
                    'Upgrade: websocket',
                    'Connection: Upgrade',
                    `Sec-WebSocket-Accept: ${accept_key}`
                ];

                socket.write(headers.join('\r\n') + '\r\n\r\n');

                const shell = pty.spawn(shell_name, [], {
                    name: 'xterm-color',
                    cols: 80,
                    rows: 24,
                    cwd: os.homedir(),
                    env: process.env
                });

                shell.onData(data => {
                    if (!socket.destroyed) socket.write(build_frame(Buffer.from(data)));
                });

                socket.on('data', buf => {
                    const msg = parse_frame(buf);
                    if (!msg) return;

                    const str = msg.toString();
                    if (str.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(str);
                            if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
                                shell.resize(parsed.cols, parsed.rows);
                            }
                        } catch {}
                        return;
                    }

                    shell.write(str);
                });

                const cleanup = () => { try { shell.kill(); } catch {} };
                socket.on('close', cleanup);
                socket.on('error', cleanup);
                shell.on('exit', () => socket.end());
            });

            server.once('error', err => {
                if (err.code === 'EADDRINUSE') {
                    start_server(port + 1);
                    return;
                }
                throw err;
            });

            server.listen(port, '0.0.0.0', () => {
                const assigned = server.address().port;
                const ip = get_ip();

                console.log(`
\x1b[1mShell Exposed HTTP\x1b[0m
\x1b[2mStatus:\x1b[38;5;167m Online \x1b[0m
\x1b[2mPort:\x1b[38;5;167m ${assigned}\x1b[0m

\x1b[38;2;180;210;170mLocal:\x1b[0m http://localhost:\x1b[38;5;167m${assigned}\x1b[0m
\x1b[38;2;180;210;170mNetwork:\x1b[0m http://${ip}:\x1b[38;5;167m${assigned}\x1b[0m
                `);
            });
        }

        start_server(Number(flags.port));
    }
};
