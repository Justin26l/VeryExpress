const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { fileURLToPath } = require('url');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let version = pkg.version;
const mode = process.env.npm_config_version_type || process.argv[2] || 'none';

const versionMatch = version.match(/^(\d+)\.(\d+)\.(\d+)(-dev(\d+))?$/);
if (!versionMatch) {
  throw new Error('Version must be in the form x.y.z or x.y.z-devN');
}
let [_, major, minor, patch, devFull, devNum] = versionMatch;
major = parseInt(major);
minor = parseInt(minor);
patch = parseInt(patch);
let newVersion;

if (mode === 'dev') {
  if (devNum) {
    newVersion = `${major}.${minor}.${patch}-dev${parseInt(devNum) + 1}`;
  } else {
    newVersion = `${major}.${minor}.${patch}-dev1`;
  }
} else if (mode === 'patch') {
  patch += 1;
  newVersion = `${major}.${minor}.${patch}`;
} else if (mode === 'minor') {
  minor += 1;
  patch = 0;
  newVersion = `${major}.${minor}.${patch}`;
} else if (mode === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
  newVersion = `${major}.${minor}.${patch}`;
} else {
  newVersion = `${major}.${minor}.${patch}`;
}

pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Bumped version (${mode}) to`, newVersion);

// Add git tag for versioning
try {
  execSync(`git commit -am "v${newVersion}"`);
  execSync(`git tag v${newVersion}`);
  console.log(`Created git tag v${newVersion}`);
} catch (e) {
  console.warn('Failed to create git tag:', e.message);
}