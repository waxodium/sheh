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

module.exports = function(context, arguments_list) {

    const public_directory = path.resolve(context.root, "public");

    function serve_static(request, response) {
        const request_url = request.url.split('?')[0];
        let safe_path = "";

        if (request_url === '/') {
            safe_path = '/index.html';
        } else {
            safe_path = request_url;
        }

        const relative_path = path.normalize(safe_path).replace(/^(\/|\\)+/, '');
        const file_path = path.join(public_directory, relative_path);

        if (!file_path.startsWith(public_directory)) {
            response.writeHead(403);
            response.end('403 Forbidden');
            return;
        }

        fs.stat(file_path, function(error, status) {
            if (error) {
                response.writeHead(404);
                response.end('404 Not Found');
                return;
            }

            if (!status.isFile()) {
                response.writeHead(404);
                response.end('404 Not Found');
                return;
            }

            const extension = path.extname(file_path).toLowerCase();
            let content_type = "";

            if (mime_types[extension]) {
                content_type = mime_types[extension];
            } else {
                content_type = 'application/octet-stream';
            }

            response.writeHead(200, {
                'Content-Type': content_type,
                'Content-Length': status.size
            });

            fs.createReadStream(file_path).pipe(response);
        });
    }

    function build_frame(data) {
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

    function parse_frame(buffer) {
        if (buffer.length < 2) {
            return null;
        }

        const second_byte = buffer[1];
        const is_masked = (second_byte & 0x80) === 0x80;
        let data_length = second_byte & 0x7f;
        let offset = 2;

        if (data_length === 126) {
            if (buffer.length < 4) {
                return null;
            }
            data_length = buffer.readUInt16BE(2);
            offset = 4;
        } else if (data_length === 127) {
            if (buffer.length < 10) {
                return null;
            }
            data_length = Number(buffer.readBigUInt64BE(2));
            offset = 10;
        }

        let masking_key;

        if (is_masked) {
            if (buffer.length < offset + 4) {
                return null;
            }
            masking_key = buffer.subarray(offset, offset + 4);
            offset += 4;
        }

        if (buffer.length < offset + data_length) {
            return null;
        }

        const frame_data = Buffer.from(
            buffer.subarray(offset, offset + data_length)
        );

        if (is_masked) {
            if (masking_key) {
                for (let index = 0; index < frame_data.length; index++) {
                    frame_data[index] ^= masking_key[index % 4];
                }
            }
        }

        return frame_data;
    }

    function start_server(port = 8080) {
        const server = http.createServer(serve_static);

        server.on('upgrade', function (request, socket) {
            const key = request.headers['sec-websocket-key'];

            if (!key) {
                socket.destroy();
                return;
            }

            const accept_key = crypto
                .createHash('sha1')
                .update(key + guid)
                .digest('base64');

            const headers = [
                'HTTP/1.1 101 Switching Protocols',
                'Upgrade: websocket',
                'Connection: Upgrade',
                'Sec-WebSocket-Accept: ' + accept_key
            ];

            socket.write(headers.join('\r\n') + '\r\n\r\n');

            const shell = pty.spawn(shell_name, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 24,
                cwd: os.homedir(),
                env: process.env
            });

            shell.onData(function (data) {
                if (!socket.destroyed) {
                    socket.write(build_frame(Buffer.from(data)));
                }
            });

            socket.on('data', function (buffer) {
                const message = parse_frame(buffer);
                if (!message) {
                    return;
                }

                const data = message.toString();

                if (data.startsWith('{')) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.type === 'resize') {
                            if (parsed.cols) {
                                if (parsed.rows) {
                                    shell.resize(parsed.cols, parsed.rows);
                                }
                            }
                        }
                    } catch (error) {}
                    return;
                }

                shell.write(data);
            });

            function cleanup() {
                try {
                    shell.kill();
                } catch (error) {}
            }

            socket.on('close', cleanup);
            socket.on('error', cleanup);

            shell.on('exit', function () {
                socket.end();
            });
        });

        server.once('error', function (error) {
            if (error.code === 'EADDRINUSE') {
                start_server(port + 1);
                return;
            }

            throw error;
        });

        server.listen(port, '0.0.0.0', function () {
            const network_details = Object.values(os.networkInterfaces()).flat();

            const network = network_details.find(
                function(details) {
                    if (details.family === 'IPv4') {
                        if (details.internal === false) {
                            return true;
                        }
                    }
                    return false;
                }
            );

            const assigned = server.address().port;

            let address = 'localhost';

            if (network) {
                address = network.address;
            }

            const coral_green = '\x1b[38;5;167m';
            const lower_green = '\x1b[38;2;180;210;170m';
            const dim_white = '\x1b[2m';
            const reset = '\x1b[0m';
            const bold = '\x1b[1m';

            console.log(`
${bold}Shell Exposed HTTP${reset}
${dim_white}Status:${coral_green} Online ${reset}
${dim_white}Port:${coral_green} ${assigned}${reset}

${lower_green}Local:${reset} http://localhost:${coral_green}${assigned}${reset}
${lower_green}Network:${reset} http://${address}:${coral_green}${assigned}${reset}
            `);
        });
    }

    start_server();
};
