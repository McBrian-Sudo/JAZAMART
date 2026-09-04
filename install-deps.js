const { spawnSync } = require('child_process');
const { platform, env } = process;

const npm = platform === 'win32' ? 'npm.cmd' : 'npm';
const registry = env.npm_config_registry || 'https://registry.npmjs.org/';

console.log('Installing JazaMart backend dependencies...');
console.log('Node:', process.version);
console.log('Registry:', registry);
console.log('Network settings are loaded from .npmrc.');

const result = spawnSync(npm, ['install', '--no-audit', '--no-fund'], {
  stdio: 'inherit',
  shell: false,
  cwd: __dirname,
  env
});

if (result.error) {
  console.error('\nUnable to launch npm:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error('\nDependency installation failed.');
  console.error('This is usually a machine/network issue when the error contains EAI_AGAIN, ENOTFOUND, or ETIMEDOUT.');
  console.error('Run: npm ping');
  console.error('Run: nslookup registry.npmjs.org');
  console.error('Then retry: npm install');
  process.exit(result.status || 1);
}

console.log('\nBackend dependencies installed successfully.');
