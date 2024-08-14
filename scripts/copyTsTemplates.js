// copy dir src/templates/utils to dist/templates/utils
const fs = require('fs');
const path = require('path');
    
/**
 * to copy template files into tsc output dir (dist)
 */
function copyDir (src, destination) {
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination);
    }
    fs.readdirSync(src).forEach((file) => {
        const srcPath = path.join(src, file);
        const destPath = path.join(destination, file);
        const stat = fs.statSync(srcPath);
        if (stat.isFile()) {
            fs.writeFileSync(destPath, fs.readFileSync(srcPath));
        } else if (stat.isDirectory()) {
            copyDir(srcPath, destPath);
        }
    });
}

copyDir('src/templates', 'dist/templates');
