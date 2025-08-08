#!/usr/bin/env node

import { join, dirname } from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { access, constants } from 'fs/promises';

const require = createRequire(import.meta.url);

async function findClientPath(): Promise<string> {
  if (process.env.CNS_CLIENT_PATH) {
    return process.env.CNS_CLIENT_PATH;
  }
  
  try {
    const packageClientPath = require.resolve('cns-mcp-server/dist/client/index.js');
    await access(packageClientPath, constants.F_OK);
    return packageClientPath;
  } catch {
    // Try relative paths
    const currentDir = dirname(dirname(dirname(__filename)));
    const paths = [
      join(currentDir, 'dist/client/index.js'),
      join(process.cwd(), 'dist/client/index.js'),
      join(__dirname, '../client/index.js'),
    ];
    
    for (const path of paths) {
      try {
        await access(path, constants.F_OK);
        return path;
      } catch {
        continue;
      }
    }
  }
  
  throw new Error('CNS client not found. Try: npm run build');
}

async function main() {
  try {
    const clientPath = await findClientPath();
    const args = process.argv.slice(2);
    
    const child = spawn('node', [clientPath, ...args], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      process.exit(code || 0);
    });
    
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}