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
  const scannable = source.replace(/--[^\r\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of scannable.matchAll(/\braise\b[\s\S]*?;/gi)) {
    const statement = match[0];
    if (/^raise\s*;$/i.test(statement.trim())) continue; // PL/pgSQL rethrow
    const literal = /^raise\s+(?:exception\s+)?'((?:[^']|'')*)'/i.exec(statement.trim());
    const line = scannable.slice(0, match.index).split(/\r?\n/).length;
    if (!literal) {
      failures.push(`${relative(root, path)}:${line} has a dynamic or unsupported RAISE statement`);
      continue;
    }
    const message = literal[1].replaceAll("''", "'");
    const code = /^([A-Z][A-Z0-9_]+):(?:\s|$)/.exec(message)?.[1];
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
