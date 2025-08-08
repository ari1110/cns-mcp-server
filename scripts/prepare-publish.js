#!/usr/bin/env node

/**
 * Pre-publish preparation script
 * Validates the package is ready for publishing to NPM
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

console.log('🔍 Running pre-publish validation...\n');

let hasErrors = false;

// Check that dist/ directory exists and has built files
console.log('✓ Checking build artifacts...');
const distDir = join(rootDir, 'dist');
if (!existsSync(distDir)) {
  console.error('❌ dist/ directory not found. Run `npm run build` first.');
  hasErrors = true;
}

const requiredDistFiles = [
  'index.js',
  'cli/server.js', 
  'cli/client.js',
  'commands/index.js',
  'memory/index.js',
  'orchestration/engine.js'
];

for (const file of requiredDistFiles) {
  const filePath = join(distDir, file);
  if (!existsSync(filePath)) {
    console.error(`❌ Missing built file: dist/${file}`);
    hasErrors = true;
  }
}

if (!hasErrors) {
  console.log('✅ All required build artifacts present');
}

// Check package.json has correct fields for publishing
console.log('\n✓ Validating package.json...');
const packageJsonPath = join(rootDir, 'package.json');
const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

// Validate required fields
const requiredFields = ['name', 'version', 'description', 'main', 'bin', 'repository', 'license'];
for (const field of requiredFields) {
  if (!pkg[field]) {
    console.error(`❌ Missing required field in package.json: ${field}`);
    hasErrors = true;
  }
}

// Validate repository URL is not placeholder
if (pkg.repository && pkg.repository.url && pkg.repository.url.includes('your-org')) {
  console.error('❌ Repository URL still contains placeholder "your-org"');
  hasErrors = true;
}

// Validate bin files exist
if (pkg.bin) {
  for (const [command, path] of Object.entries(pkg.bin)) {
    const binPath = join(rootDir, path);
    if (!existsSync(binPath)) {
      console.error(`❌ Binary file not found: ${path} (for command: ${command})`);
      hasErrors = true;
    }
  }
}

if (!hasErrors) {
  console.log('✅ package.json validation passed');
}

// Check that important files exist for NPM package
console.log('\n✓ Checking package files...');
const requiredFiles = [
  'README.md',
  'INSTALLATION.md',
  '.npmignore'
];

for (const file of requiredFiles) {
  const filePath = join(rootDir, file);
  if (!existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    hasErrors = true;
  }
}

if (!hasErrors) {
  console.log('✅ All required package files present');
}

// Final validation
if (hasErrors) {
  console.log('\n❌ Pre-publish validation FAILED! Fix the above errors before publishing.');
  process.exit(1);
} else {
  console.log('\n🎉 Pre-publish validation PASSED! Package is ready for publishing.');
  console.log('\nNext steps:');
  console.log('  - Version will be handled by semantic-release');
  console.log('  - Publishing will be automated via GitHub Actions');
  console.log('  - Or manually: npm publish');
}