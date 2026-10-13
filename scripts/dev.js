import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const services = [
  ['backend', '../backend/server.js', ['--watch']],
  ['frontend', '../frontend/node_modules/vite/bin/vite.js', []],
];

let stopping = false;
const children = services.map(([name, entry, args]) => {
  const child = spawn(process.execPath, [...args, fileURLToPath(new URL(entry, import.meta.url))], {
    cwd: fileURLToPath(new URL(`../${name}/`, import.meta.url)),
    stdio: 'inherit',
  });
  child.on('error', (error) => {
    console.error(`Could not start ${name}: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
  return child;
});

function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
