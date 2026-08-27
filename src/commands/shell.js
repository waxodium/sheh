const process_module = require('@waxory/sheh/getshell');
const shell_name = process_module.getShell();


module.exports = function(context, arguments_list) {
    console.log(shell_name);
};
