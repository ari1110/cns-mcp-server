#!/usr/bin/env node
/**
 * CNS MCP Client - Communicates with CNS MCP Server
 * Used by thin hook wrappers
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { access, constants, readFile } from 'fs/promises';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);

// Get package version dynamically
async function getPackageVersion(): Promise<string> {
  try {
    const __dirname = dirname(__filename);
    const packagePath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    logger.warn('Failed to read package version, using fallback:', error);
    return '1.2.2'; // Fallback version
  }
}
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

async function findServerPath(): Promise<string> {
  // Option 1: Environment variable (allows user override)
  if (process.env.CNS_SERVER_PATH) {
    return process.env.CNS_SERVER_PATH;
  }

  // Option 2: Try package.json resolution (works for npm installs)
  try {
    const packageServerPath = require.resolve('cns-mcp-server/dist/index.js');
    await access(packageServerPath, constants.F_OK);
    return packageServerPath;
  } catch {
    // Package resolution failed, try other methods
  }

  // Option 3: Relative to this file (works for source builds and development)
  const candidates = [
    join(__dirname, '..', 'index.js'),                     // Same level
    join(__dirname, '..', '..', 'dist', 'index.js'),       // Built distribution  
    join(__dirname, '..', '..', 'src', 'index.js'),        // Source (development)
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      // Try next candidate
    }
  }

  throw new Error(
    'CNS server not found. Please ensure cns-mcp-server is properly installed, ' +
    'or set CNS_SERVER_PATH environment variable to the server location.'
  );
}

export class CNSClient {
  private client: Client;
  private transport!: StdioClientTransport;

  private version: string = '1.2.2';

  constructor() {
    // Initialize version asynchronously
    getPackageVersion().then(v => this.version = v);
    
    this.client = new Client(
      {
        name: 'cns-client',
        version: this.version,
      },
      {
        capabilities: {},
      }
    );
  }

  async connect() {
    // Create transport to communicate with CNS MCP Server
    const serverPath = await findServerPath();
    
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    });

    await this.client.connect(this.transport);
  }

  async callTool(toolName: string, args: any) {
    try {
      const response = await this.client.callTool({
        name: toolName,
        arguments: args,
      });
      
      return response;
    } catch (error) {
      logger.error(`CNS Client error calling ${toolName}`, { toolName, error });
      throw error;
    }
  }

  async disconnect() {
    await this.client.close();
  }
}

// CLI interface
async function main() {
  const toolName = process.argv[2];
  
  if (!toolName) {
    logger.error('Usage: cns-client <tool_name>');
    process.exit(1);
  }

  let inputData;
  try {
    // Read JSON from stdin
    inputData = JSON.parse(await readStdin());
  } catch (error) {
    logger.error('Failed to parse input JSON', { error });
    process.exit(1);
  }

  const client = new CNSClient();
  
  try {
    await client.connect();
    const result = await client.callTool(toolName, inputData);
    // Use console.log for output as this is expected by calling scripts
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    logger.error('CNS Client error', { toolName, error });
    process.exit(1);
  } finally {
    await client.disconnect();
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
    
    process.stdin.on('error', (error) => {
      reject(error);
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('CNS Client fatal error', { error });
    process.exit(1);
  });
}