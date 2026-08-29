const process_module = require('@waxory/sheh/getshell');
const shell_name = process_module.getShell();

module.exports = {
    
    run(context, args, flags) {
        console.log(shell_name);
    }

};
