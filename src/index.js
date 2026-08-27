#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const context = {
    root: path.resolve(__dirname, "..")
};

const commands = {};

const commandDir = path.join(__dirname, "commands");

for (const file of fs.readdirSync(commandDir)) {
    if (!file.endsWith(".js")) continue;

    const name = path.basename(file, ".js");

    commands[name] = require(
        path.join(commandDir, file)
    );
}

const args = process.argv.slice(2);

if (args.length === 0) {
    if (!commands.server) {
        process.exit(1);
    }

    commands.server(context, []);
} else {
    const command = args.shift();

    if (!commands[command]) {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }

    commands[command](context, args);
}
