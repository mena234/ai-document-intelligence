import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'],
  { stdio: 'inherit' },
);
writeFileSync('.test-build/package.json', JSON.stringify({ type: 'commonjs' }));
execFileSync(process.execPath, ['--test', '.test-build/tests/core.test.js'], {
  stdio: 'inherit',
});
