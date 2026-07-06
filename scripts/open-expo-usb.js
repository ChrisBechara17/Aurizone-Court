const { existsSync } = require('fs');
const { join } = require('path');
const { spawnSync } = require('child_process');
const { homedir } = require('os');

const SCRCPY_ADB = join(
  homedir(),
  'Downloads',
  'scrcpy-win64-v3.3.4',
  'scrcpy-win64-v3.3.4',
  'adb.exe',
);

const adb = existsSync(SCRCPY_ADB) ? SCRCPY_ADB : 'adb';
const expoUrl = process.argv[2] ?? 'exp://127.0.0.1:8081';

function run(args) {
  const result = spawnSync(adb, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['reverse', 'tcp:8081', 'tcp:8081']);
run(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', expoUrl]);

