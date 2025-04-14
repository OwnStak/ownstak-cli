#!/usr/bin/env node
import { Command } from 'commander';
import { logger } from '../logger.js';
import { DESCRIPTION, NAME, SUPPORT_URL, VERSION } from '../constants.js';

import { build } from './build.js';
import { dev } from './dev.js';
import { start } from './start.js';
import { deploy } from './deploy.js';
import { login } from './login.js';

// Import all framework implementations to ensure they're registered
import '../frameworks/nextjs/nextjs.js';
import { upgrade } from './upgrade.js';

process.on('uncaughtException', (e: any) => {
    logger.error(`${e.stack}\r\n`);
    logger.error(`Hoops! Something went wrong. Please see the error above for more details. You can set the --debug flag to get more information.`);
    logger.error(`If you need help or you think this is an bug, please reach out to us at ${SUPPORT_URL}`);
    process.exit(1);
});

// Use version and description from package.json
const program = new Command()
    .name(NAME)
    .version(VERSION, '-v, --version', 'Output the current version')
    .description(DESCRIPTION)
    .helpOption('-h, --help', 'Display help for command')
    .option('-d, --debug', 'Enable debug mode')
    .hook('preAction', (thisCommand, actionCommand) => {
        // Global hook that always runs before any command
        const { debug } = thisCommand.opts();
        if (debug) process.env.LOG_LEVEL = 'debug';
    });

program
    .command('build')
    .description('Build the app for production')
    .option('-s, --skip-framework-build', 'Skip the framework build')
    .action(build);
    
program
    .command('dev')
    .description('Start the app in development mode')
    .action(dev);

program
    .command('start')
    .alias('run')
    .description('Start the app in production mode')
    .action(start);

program
    .command('deploy')
    .description('Deploy the app to the platform')
    .action(deploy);

program
    .command('login')
    .description('Log in to the platform')
    .action(login);

program
    .command('upgrade [version]')
    .description('Upgrade the CLI to latest or specified version')  
    .action((version) => upgrade({ version }));

program.addHelpText('after', `
Examples:
  npx ${NAME} build next
`);

program.parse(process.argv);