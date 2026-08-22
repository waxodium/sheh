#!/usr/bin/env node

/*
* Sheh. Use the terminal through the browser locally.
* Copyright (C) 2026  waxodium
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <https://www.gnu.org/licenses/>.
*
*
*/


const express = require('express')
const http = require('http')
const nodepty = require('node-pty')
const { WebSocketServer } = require('ws')
const path = require('path')
const os = require('os')
const morgan = require('morgan')
const { execSync } = require('child_process')

const webapp = express()
const server = http.createServer(webapp);
webapp.use(express.static(path.join(__dirname, '..', 'public')));
webapp.use('/lib', express.static(path.join(__dirname, '..', 'lib')));

    
function getShell() {
    if (process.platform === 'win32') {
        return 'powershell.exe'
    };


    let shellName
    try {
        shellName = execSync('ps -p $(ps -p $PPID -o ppid=) -o comm=').toString().trim();
    } catch (error) {
        return '/bin/sh'
    }

    return shellName
}



const webSocketServe = new WebSocketServer({ server })
webSocketServe.on('connection', (websocket) => {


    const shellName = getShell();
    const shell = nodepty.spawn(shellName, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: os.homedir(),
        env: process.env
    });

    shell.onData((data) => {
        if (websocket.readyState === websocket.OPEN) {
            websocket.send(data);
        }
    })

    websocket.on('message', (message) => {
        const data = message.toString()

        if (data.startsWith('{"type":"resize"')) {
            try {
                 const { cols, rows } = JSON.parse(data);
                shell.resize(cols, rows)
            } catch (err) {
                console.error(err);
            }
            return;
        }

        shell.write(data)
    });

    websocket.on('close', () => {
        shell.kill();
    });
});



function startServer({ network = false } = {}) {
    const host = network ? '0.0.0.0' : '127.0.0.1';

    server.listen(0, host, () => {
        const assigned = server.address().port;
        const coralGreen = '\x1b[38;5;167m';
        const lowerGreen = '\x1b[38;2;180;210;170m';
        const dimWhite = '\x1b[2m';
        const reset = '\x1b[0m';
        const bold = '\x1b[1m';
        let networkAddress = `${dimWhite}Network:${reset} disabled (use --network to expose it)\n`;

        if (network) {
            const networkDetails = Object.values(os.networkInterfaces()).flat();
            const networkInterface = networkDetails.find(details => details.family === 'IPv4' && details.internal === false);
            const address = networkInterface ? networkInterface.address : 'localhost';
            networkAddress = `${lowerGreen}Network:${reset} http://${address}:${coralGreen}${assigned}${reset}\n`;
        }

        console.log(`\n${bold}Shell Exposed HTTP${reset}
${dimWhite}Status:${coralGreen} Online ${reset}
${dimWhite}Port:${coralGreen} ${assigned}${reset}

${lowerGreen}Local:${reset} http://localhost:${coralGreen}${assigned}${reset}
${networkAddress}`);
    });

    return server;
}

if (require.main === module) {
    startServer();
}

const cyan = "\x1b[36m";
const green = "\x1b[32m";
const recolor = "\x1b[0m";
webapp.use(morgan((tokens, request, response) => {
 

    const method = tokens.method(request, response);
    const url = tokens.url(request, response);
    const status = tokens.status(request, response);
    const browser = request.get('User-Agent');



    return `${cyan}${method}${recolor} ${url} - Status: ${green}${status}${recolor} - Agent: ${browser}`


}));

webapp.use(
    morgan(`${cyan}:method${recolor} :url ${green}:status${recolor} :res[content-length] - :response-time ms\nIP: :remote-addr\nServer on :referrer`)
);


module.exports = { startServer, getShell };

