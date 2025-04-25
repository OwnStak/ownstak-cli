#!/usr/bin/env node
import chalk from 'chalk';
import { CliError } from '../cliError.js';
import { Command } from 'commander';
import { logger } from '../logger.js';
import { BRAND, NAME, NAME_SHORT, SUPPORT_URL, VERSION } from '../constants.js';

import { build } from './build.js';
import { dev } from './dev.js';
import { start } from './start.js';
import { deploy } from './deploy.js';
import { login } from './login.js';
import { logout } from './logout.js';
import { upgrade } from './upgrade.js';
import { configInit } from './config/init.js';
import { configPrint } from './config/print.js';

process.on('uncaughtException', (e: any) => {
    logger.error(e.message);

    // CLI Errors are expected, intentional errors.
    // We don't want to show the stack trace for them.
    if (e instanceof CliError) {
        process.exit(1);
    }

    // Show the stack trace for unexpected errors.
    logger.error(chalk.gray(`\r\nYou can try to run the command again with the --debug flag to get more information.`));
    logger.error(chalk.gray(`If you need help or you think this is an bug, please reach out to us at ${SUPPORT_URL}`));
    logger.error(chalk.gray(`\r\nStack trace:`));
    logger.error(
        chalk.gray(
            e.stack
                .split('\n')
                .map((line: string) => `    ${line}`)
                .join('\n'),
        ),
    );
    process.exit(1);
});

// Use version and description from package.json
const program = new Command()
    .name(NAME)
    .description(`Build and deploy your project to ${BRAND}`)
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

program.command('start').alias('run').description('Start the project in production mode').action(start);

program.command('deploy').description('Deploy the project to the platform').action(deploy);

program.command('login').description('Log in to the platform').action(login);

program.command('logout').description('Log out of the platform').action(logout);

const configCommand = program.command('config').description(`Manage the ${BRAND} project config`);
configCommand.command('init').description(`Initialize the ${BRAND} project config file`).action(configInit);
configCommand.command('print').description(`Prints the current ${BRAND} project config`).action(configPrint);

program
    .command('upgrade [version]')
    .description('Upgrade the CLI to latest or specified version')
    .action((version) => upgrade({ version }));

program.addHelpText(
    'after',
    `
Examples:
  npx ${NAME_SHORT} build nextjs
  npx ${NAME_SHORT} build astro
  npx ${NAME_SHORT} config init
  npx ${NAME_SHORT} config print
`,
);

program.parse(process.argv);
