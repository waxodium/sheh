#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const globalOptions = {
    help: { type: "boolean", alias: "h", default: false, description: "Show help information" },
    version: { type: "boolean", alias: "v", default: false, description: "Dispaly Shell Exposed HTTP version" }
};

const defaultOptions = {
    help: { type: "boolean", alias: "h", default: false }
};

function parseOptions(args, options) {
    const flags = {};
    const remaining = [];

    for (const [key, config] of Object.entries(options)) {
        flags[key] = config.default;
    }

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (!arg.startsWith("-")) {
            remaining.push(arg);
            continue;
        }

        let name = arg;
        let value = null;

        const equalsIndex = arg.indexOf("=");
        if (equalsIndex !== -1) {
            name = arg.slice(0, equalsIndex);
            value = arg.slice(equalsIndex + 1);
        }

        let matchedKey = null;
        let matchedConfig = null;

        for (const [key, config] of Object.entries(options)) {
            const isLong = name === `--${key}`;
            const isShort = config.alias && name === `-${config.alias}`;

            if (isLong || isShort) {
                matchedKey = key;
                matchedConfig = config;
                break;
            }
        }

        if (!matchedKey) {
            console.error(`sheh: Unknown option '${arg}'.`);
            process.exit(1);
        }

        if (matchedConfig.type === "boolean") {
            flags[matchedKey] = true;
        } else if (matchedConfig.type === "string") {
            if (value !== null) {
                flags[matchedKey] = value;
            } else {
                const next = args[i + 1];

                if (!next || next.startsWith("-")) {
                    console.error(`Option '${arg}' requires a value.`);
                    process.exit(1);
                }

                i++;
                flags[matchedKey] = args[i];
            }
        }
    }

    return { flags, remaining };
}

function validateFlags(flags, options) {
    for (const [key, config] of Object.entries(options)) {
        if (!config.validate) continue;

        const error = config.validate(flags[key]);
        if (error) {
            console.error(`Invalid value for '--${key}'.`);
            process.exit(1);
        }
    }
}

function loadCommands(directory) {
    if (!fs.existsSync(directory)) {
        console.error("Application error. Required files are missing.");
        process.exit(1);
    }

    const commands = {};
    const files = fs.readdirSync(directory).filter(file => file.endsWith(".js"));

    for (const file of files) {
        const name = path.basename(file, ".js");
        commands[name] = require(path.join(directory, file));
    }

    return commands;
}

function getRunner(command) {
    return typeof command.run === "function" ? command.run : command;
}

const args = process.argv.slice(2);
const directory = path.join(__dirname, "commands");
const commands = loadCommands(directory);

let commandIndex = -1;
for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("-")) {
        commandIndex = i;
        break;
    }
}

let globalArgs = [];
let commandName = "";
let commandArgs = [];

if (commandIndex === -1) {
    globalArgs = args;
} else {
    globalArgs = args.slice(0, commandIndex);
    commandName = args[commandIndex];
    commandArgs = args.slice(commandIndex + 1);
}

const { flags: globalFlags } = parseOptions(globalArgs, globalOptions);
validateFlags(globalFlags, globalOptions);

const context = { 
    root: path.resolve(__dirname, ".."),
    globalOptions 
};

// %%%%%%%%%%%% Global Options %%%%%%%%%%%% 

if (globalFlags.help && !commandName) {
    if (!commands.help) process.exit(1);
    getRunner(commands.help)(context, [], {}, globalFlags);
    process.exit(0);
}

if (globalFlags.version) {
    const pkg = require(path.join(__dirname, "../package.json"));
    console.log(`v${pkg.version}`);
    process.exit(0);
}

// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

if (!commandName) {
    commandName = "server";
}

if (commandName === "help") {
    if (!commands.help) process.exit(1);
    getRunner(commands.help)(context, commandArgs, {}, globalFlags);
    process.exit(0);
}

const command = commands[commandName];
if (!command) {
    console.error(`sheh: '${commandName}' is unrecognized.\nRun 'sheh --help' for valid commands.`);
    process.exit(1);
}

const mergedGlobalOpts = Object.assign({}, globalOptions, defaultOptions);
const options = Object.assign({}, mergedGlobalOpts, command.options || {});
const { flags: localFlags, remaining: positional } = parseOptions(commandArgs, options);
validateFlags(localFlags, options);

if (localFlags.help || globalFlags.help) {
    if (!commands.help) process.exit(1);
    getRunner(commands.help)(context, [commandName], localFlags, globalFlags);
    process.exit(0);
}

const runner = getRunner(command);
runner(context, positional, localFlags, globalFlags);
