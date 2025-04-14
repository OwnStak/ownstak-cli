import { Config } from '../config.js';
import { logger } from '../logger.js';

export interface Framework {
  name: string;
  build: (config: Config) => Promise<void> | void;
  dev: () => Promise<void> | void;
  isPresent: () => Promise<boolean> | boolean;
}

// Registry of supported frameworks
const frameworks: Record<string, Framework> = {};

/**
 * Register a framework implementation
 */
export function registerFramework(framework: Framework): void {
  logger.debug(`Registering framework: ${framework.name}`);
  frameworks[framework.name] = framework;
}

/**
 * Get a framework implementation by ID
 */
export function getFramework(name?: string): Framework | undefined {
  if(!name) return undefined;
  return frameworks[name];
}

/**
 * Get all registered frameworks
 */
export function getAllFrameworks(): Record<string, Framework> {
  return { ...frameworks };
}

/**
 * Detect if a framework is installed
 */
export async function detectFramework(): Promise<Framework | undefined> {
  for (const framework of Object.values(frameworks)) {
    logger.debug(`Checking if ${framework.name} is installed...`);
    if (await framework.isPresent()) {
      return framework;
    }
  }
  return undefined
}