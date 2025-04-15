#!/usr/bin/env node
import { Command } from 'commander';
import { logger } from '../logger.js';
import { DESCRIPTION, NAME, RUNTIMES, SUPPORT_URL, VERSION } from '../constants.js';

import { build } from './build.js';
import { dev } from './dev.js';
import { start } from './start.js';
import { deploy } from './deploy.js';
import { login } from './login.js';
import { logout } from './logout.js';
import { upgrade } from './upgrade.js';

// Import all framework implementations to ensure they're registered
import '../frameworks/nextjs/nextjs.js';

process.on('uncaughtException', (e: any) => {
    logger.log(`Stack trace:`);
    logger.log(
        e.stack
            .split('\n')
            .map((line: string) => `    ${line}`)
            .join('\n'),
    );
    logger.error(e.message);
    logger.error(`Hoops! Something went wrong. Please see the error above for more details. You can set the --debug flag to get more information.`);
    logger.error(`If you need help or you think this is an bug, please reach out to us at ${SUPPORT_URL}`);
    process.exit(1);
});

// Use version and description from package.json
const program = new Command()
    .name(NAME)
    .description('Build and deploy your application to OwnStak')
    .version(VERSION, '-v, --version')
    .addHelpText('beforeAll', () => `${logger.drawTitle('help') ?? ''}`)
    .helpOption('-h, --help', 'Display help for command')
    .option('-d, --debug', 'Enable debug mode')
    .hook('preAction', (thisCommand, actionCommand) => {
        // Global hook that always runs before any command
        const { debug } = thisCommand.opts();
        if (debug) process.env.LOG_LEVEL = 'debug';
        logger.drawTitle(actionCommand.name());
    });

program
    .command('build [framework]')
    .description('Build the app for production')
    .option('-s, --skip-framework-build', 'Skip the build of the framework and use existing build output')
    .option('--assets-dir <dir>', 'Optional directory with static assets to include in the build')
    .action((framework, options) => build({ framework, ...options }));

program.command('dev').description('Start the project in development mode').action(dev);

program.command('start').alias('run').description('Start the app in production mode').action(start);

program.command('deploy').description('Deploy the project to the platform').action(deploy);

program.command('login').description('Log in to the platform').action(login);

program.command('logout').description('Log out of the platform').action(logout);

program
    .command('upgrade [version]')
    .description('Upgrade the CLI to latest or specified version')
    .action((version) => upgrade({ version }));

program.addHelpText(
    'after',
    `
Examples:
  npx ${NAME} build next
`,
);

program.parse(process.argv);
