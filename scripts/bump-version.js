import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

function bumpVersion(mode, devNum, major, minor, patch) {
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
    console.error('\x1b[31m', `Invalid version mode "${mode}", no version applied`);
    process.exit(0);
  };
  return newVersion;
};

function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const mode = process.env.npm_config_version_type || process.argv[2] || 'none';

  const versionMatch = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)(-dev(\d+))?$/);
  if (!versionMatch) {
    console.error('\x1b[31m', `Invalid version "${pkg.version}", Version must be in the form x.y.z or x.y.z-devN, no version applied`);
    process.exit(0);
  };

  let [_, major, minor, patch, devFull, devNum] = versionMatch;
  major = parseInt(major);
  minor = parseInt(minor);
  patch = parseInt(patch);

  // Run preversion
  if (pkg.scripts && pkg.scripts.preversion) {
    try {
      execSync(pkg.scripts.preversion, { stdio: 'inherit' });
    } catch (e) {
      console.warn('preversion script failed:', e.message);
      process.exit(1);
    }
  };

  // Bump version
  const newVersion = bumpVersion(mode, devNum, major, minor, patch);
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Bumped version (${mode}) to`, newVersion);

  // Run postversion
  if (pkg.scripts && pkg.scripts.postversion) {
    try {
      execSync(pkg.scripts.postversion, { stdio: 'inherit' });
    } catch (e) {
      console.warn('postversion script failed:', e.message);
      process.exit(1);
    }
  };

  // Add git tag for versioning
  try {
    execSync(`git commit -am "v${newVersion}"`);
    execSync(`git tag v${newVersion}`);
    console.log(`Created git tag v${newVersion}`);
  } catch (e) {
    console.warn('Failed to create git tag:', e.message);
  }
};

main();