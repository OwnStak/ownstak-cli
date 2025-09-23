# OwnStak CLI

The **OwnStak CLI** is a powerful tool that allows users to build, deploy, and manage their projects on the Ownstak platform. With a focus on simplicity and efficiency, this CLI provides a seamless experience for developers.

## Requirements

- Node.js: >= 18.x

## Installation

First, ensure you have the required version of [Node.js](https://nodejs.org/en/download) installed on your machine. You can do this by installing [NVM](https://github.com/nvm-sh/nvm) for Linux/Mac or [NVM for Windows](https://github.com/coreybutler/nvm-windows).

To install the CLI globally, run:

```bash
npm install -g ownstak
```

Or use any other favorite package manager:

```bash
yarn global add ownstak
```

## Usage

Once installed, you can access the CLI using the `npx ownstak` command.

## Documentation

For more detailed guides on how to use the CLI and deploy supported frameworks, please visit [docs.ownstak.com](https://docs.ownstak.com).

## Formatting

The project uses Biome for formatting.

```bash
# Format all files in ./src
npm run format

# Check formatting without writing
npm run format:check
```

## Linting

The project uses Biome for linting, including organizing imports and reporting unused imports/variables.

```bash
# Lint and auto-fix safe issues in ./src
npm run lint

# Lint and apply unsafe fixes (use with care)
npm run lint:unsafe

# Run lint checks without writing
npm run lint:check
```
