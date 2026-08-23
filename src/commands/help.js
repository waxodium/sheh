const fs = require("fs");
const path = require("path");


module.exports = function(context, arguments_list) {

    const descriptions = {
        help: "Display help and manual",
        server: "Serves shell to a localhost",
        shell: "Print the current running shell"
    };

    const files = fs.readdirSync(__dirname)
        .filter(file => file.endsWith(".js"))
        .map(file => path.basename(file, ".js"));

    const width = Math.max(...files.map(name => name.length));

    console.log(`Usage: sheh <command> [<args>]

Commands:`);

    for (const name of files) {
        console.log(`  ${name.padEnd(width + 4)}${descriptions[name] || ""}`);
    }



}

