const COMMAND_HELP = {
    help: {
        description: "Display available commands & options"
    },
    server: {
        description: "Starts the local server instance, default: 8080",
        options: {
            port: {
                alias: "p",
                metavar: "PORT",
                description: "Specify the server port to use"
            }
        }
    },
    shell: {
        description: "Print sheh detected Command line interpreter",
        options: {}
    }
};

module.exports = {
    run(context, positional) {
        const name = positional[0];
        const target = COMMAND_HELP[name];

        if (!target) {
            console.log("Usage: sheh [global-options] <command> [options] [<args>]\n");
            
            console.log("Global Options:");
            const globalOptions = context.globalOptions || {};
            for (const [key, info] of Object.entries(globalOptions)) {
                let flag = `--${key}`;

                if (info.alias) {
                    flag += `, -${info.alias}`;
                }

                const label = flag.padEnd(25, " ");
                console.log(`  ${label} ${info.description}`);
            }

            console.log("\nCommands:");
            for (const [key, info] of Object.entries(COMMAND_HELP)) {
                const label = key.padEnd(15, " ");
                console.log(`  ${label} ${info.description}`);
            }
            return;
        }

        console.log(`Usage: sheh ${name} [options] [<args>]`);
        console.log(`${target.description}\n`);
        console.log("Options:");

        const options = target.options || {};
        for (const [key, info] of Object.entries(options)) {
            let flag = `--${key}`;

            if (info.alias) {
                flag += `, -${info.alias}`;
            }

            if (info.metavar) {
                flag += ` <${info.metavar}>`;
            }

            const label = flag.padEnd(25, " ");
            console.log(`  ${label} ${info.description}`);
        }

        const helpFlag = "--help, -h".padEnd(25, " ");
        console.log(`  ${helpFlag} Show options for '${name}'`);
    }
};
