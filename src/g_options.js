const path = require("path");

function getRunner(command) {
    return typeof command.run === "function" ? command.run : command;
}

function handleGlobalOptions(context, flags) {
    if (flags.help && !context.commandName) {
        if (!context.commands.help) {
            process.exit(1);
        }

        getRunner(context.commands.help)(
            context,
            [],
            {},
            flags
        );

        process.exit(0);
    }

    if (flags.version) {
        const pkg = require(
            path.join(context.root, "package.json")
        );

        console.log(`v${pkg.version}`);
        process.exit(0);
    }

    context.runtimeConfig = {
        font: flags.font || "monospace"
    };

}

module.exports = handleGlobalOptions;
