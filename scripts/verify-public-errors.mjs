import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const securityPath = join(root, 'supabase', 'functions', '_shared', 'security.ts');
const securitySource = readFileSync(securityPath, 'utf8');
const allowlistBlock = /const PUBLIC_RPC_ERRORS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(securitySource)?.[1];

if (!allowlistBlock) {
  throw new Error('Could not find PUBLIC_RPC_ERRORS in security.ts.');
}

const allowedCodes = new Set(
  [...allowlistBlock.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1]),
);

function sqlFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sqlFiles(path);
    return name.endsWith('.sql') ? [path] : [];
  });
}

const failures = [];
for (const path of sqlFiles(join(root, 'supabase'))) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/raise\s+exception\s+'((?:[^']|'')*)'/gi)) {
    const message = match[1].replaceAll("''", "'");
    const code = /^([A-Z][A-Z0-9_]+):(?:\s|$)/.exec(message)?.[1];
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    if (!code) {
      failures.push(`${relative(root, path)}:${line} has an untagged exception: ${message}`);
    } else if (!allowedCodes.has(code)) {
      failures.push(`${relative(root, path)}:${line} uses unmapped public error code ${code}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Verified ${allowedCodes.size} public RPC error codes and all static SQL exceptions.`);
