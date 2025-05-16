#!/usr/bin/env node
import chalk from 'chalk';
import { CliError } from '../cliError.js';
import { Command, Option } from 'commander';
import { logger, LogLevel } from '../logger.js';
import { BRAND, CONSOLE_API_URL, NAME, NAME_SHORT, SUPPORT_URL } from '../constants.js';

import { build } from './build.js';
import { dev } from './dev.js';
import { start } from './start.js';
import { deploy } from './deploy.js';
import { login } from './login.js';
import { logout } from './logout.js';
import { upgrade, displayUpgradeNotice } from './upgrade.js';
import { configInit } from './config/init.js';
import { configPrint } from './config/print.js';
import { CliConfig } from '../cliConfig.js';

// Attach default error handler
process.on('uncaughtException', handleException);

// Use version and description from package.json
const program = new Command()
    .name(NAME)
    .description(`Build and deploy your project to ${BRAND}`)
    .version(CliConfig.getCurrentVersion(), '-v, --version')
    .addHelpText('beforeAll', () => `${logger.drawTitle('help') ?? ''}`)
    .helpOption('-h, --help', 'Display help for command')
    .option('-d, --debug', 'Enable debug mode')
    .hook('preAction', preAction)
    .hook('postAction', postAction);

program
    .command('build [framework]')
    .description('Build the app for production')
    .option('-s, --skip-framework-build', 'Skip the build of the framework and use existing build output')
    .option('--assets-dir <dir>', 'Optional directory with static assets to include in the build')
    .action((framework, options) => build({ framework, ...options }));

program.command('dev').description('Start the project in development mode').action(dev);

program.command('start').alias('run').description('Start the project in production mode').action(start);

const withApiUrl = (command: Command) => command.addOption(new Option('--api-url <url>', 'The API URL to use').default(CONSOLE_API_URL).hideHelp());
const withApiToken = (command: Command) => command.option('--api-token <token>', 'The API token to use');
const withApiOptions = (command: Command) => withApiUrl(withApiToken(command));
const withEnvironmentSlugsOptions = (command: Command) =>
    command
        .option('--organization <slug>', 'The organization slug to use')
        .option('--project <slug>', 'The project slug to use')
        .option('--environment <slug>', 'The environment slug to use');

withEnvironmentSlugsOptions(withApiOptions(program.command('deploy')))
    .description('Deploy the project to the platform')
    .action(deploy);
withApiUrl(program.command('login <token>')).description('Log in to the platform').action(login);
withApiUrl(program.command('logout')).description('Log out of the platform').action(logout);

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

/**
 * Global hook that always runs before any command.
 * @param thisCommand - The command that is being executed.
 * @param actionCommand - The action command that is being executed.
 */
export async function preAction(thisCommand: Command, actionCommand: Command) {
    const { debug } = thisCommand.opts();
    if (debug) process.env.LOG_LEVEL = 'debug';

    const commandName = actionCommand.name();
    logger.drawTitle(commandName);
}

export async function postAction(_thisCommand: Command, actionCommand: Command) {
    // Check if there's a new version and display upgrade notice for deploy and build commands after all work is done.
    // NOTE: We cannot just display it anytime event loop is free. It would mess up the terminal output format.
    const commandName = actionCommand.name();
    if (['deploy', 'build'].includes(commandName)) {
        // The NPM is sometimes slow. The upgrade notice is nice to have feature but it should not block the process from exiting for too long.
        // If it takes longer than 0.5s, we'll exit process anyway.
        setTimeout(() => process.exit(0), 500);
        await displayUpgradeNotice();
    }
}

/**
 * Default error handler for all the errors inside the CLI.
 * @param e - The error object.
 */
export async function handleException(e: any) {
    const errorMessage: string = e.message;
    const errorStack: string = e.stack
        .split('\n')
        .map((line: string) => line.trim())
        .slice(1)
        .join('\n'); // remove the first line with the error message

    // Show stack trace only for unexpected errors. Not for CLI errors.
    // Do not show stack trace in table, the lines are too long.
    if (!(e instanceof CliError)) {
        logger.info('');
        logger.error(
            chalk.gray.bold(`Stack trace`) +
                '\r\n\r\n' +
                chalk.gray(errorStack) +
                '\r\n\r\n' +
                chalk.gray(`You can try to run the command again with the ${chalk.cyan('--debug')} flag to get more information.`),
        );
    }

    // Show error message in table and intentionally under the stack trace,
    // that can be pretty long.
    logger.info('');
    logger.drawTable([errorMessage], {
        title: 'Error',
        logLevel: LogLevel.ERROR,
        minWidth: 70,
        maxWidth: 70,
    });

    // Show help
    logger.info('');
    logger.drawTable([`Nothing helped? Do you think this is a bug? Reach out to us at ${SUPPORT_URL}`], {
        title: 'Support is here for you',
        logLevel: LogLevel.ERROR,
        minWidth: 70,
        maxWidth: 70,
    });
    process.exit(1);
}

program.parse(process.argv);
