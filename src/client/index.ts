#!/usr/bin/env node
/**
 * CNS MCP Client - Communicates with CNS MCP Server
 * Used by thin hook wrappers
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';
// import { spawn } from 'child_process'; // Not used in this implementation

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class CNSClient {
  private client: Client;
  private transport!: StdioClientTransport;

  constructor() {
    this.client = new Client(
      {
        name: 'cns-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  async connect() {
    // Create transport to communicate with CNS MCP Server
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [join(__dirname, '../index.js')],
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