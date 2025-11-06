const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let version = pkg.version;
const devMatch = version.match(/^(\d+)\.(\d+)\.(\d+)(\.dev(\d+))?$/);
if (!devMatch) {
  throw new Error('Version must be in the form x.y.z or x.y.z.devN');
}
const [_, major, minor, patch, devFull, devNum] = devMatch;
let newVersion;
if (devNum) {
  newVersion = `${major}.${minor}.${patch}.dev${parseInt(devNum) + 1}`;
} else {
  newVersion = `${major}.${minor}.${patch}.dev1`;
}
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
console.log('Bumped dev version to', newVersion);