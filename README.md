# @ownstak/cli

The **@ownstak/cli** is an useful tool that allows users to build, deploy, and manage their projects on the Ownstak platform.
With a focus on simplicity and efficiency, this CLI provides a seamless experience for developers.

## Requirements

- NodeJS: 20.x
- NPM: 10.x

## Installation

First, make sure you have the required NodeJS version installed on your machine.
You can do so by installing [NVM](https://github.com/nvm-sh/nvm).

```bash
git clone git@github.com:OwnStak/ownstak-cli.git
cd ownstak-cli
npm i
```

## Development

To start local development, simply run `npm run dev`. This command will build the package and publish it in the local store using `npm link`.
Every time any file in the `src/` directory is changed, `nodemon` rebuilds the package.

You can test the package locally in a different project by running the `npm link @ownstak/cli` command.

For example, to test the package locally before publishing with a Next.js project, follow these steps:

```bash
npx create-next-app@latest
cd my-app
npm i
npm link @ownstak/cli
```

Then you can run:

```bash
npx ownstak build
```

Following aliases work too:

```bash
npx @ownstak/cli
npx ownstak-cli
npx ownstak
```

NOTE: Keep in mind that running `npm install` inside the Next.js project after `npm link @ownstak/cli` command will again override your local version with the version from NPM.
