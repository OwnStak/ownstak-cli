![OwnStak CLI Banner](.github/assets/banner.jpg)

# OwnStak CLI

The **OwnStak CLI** is an useful tool that allows users to build, deploy, and manage their projects on the Ownstak platform.
With a focus on simplicity and efficiency, this CLI provides a seamless experience for developers.

## Requirements

- NodeJS: 20.x
- NPM: 11.5.1 or later

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
Every time any file in the `src/` directory is changed, `chokidar` rebuilds the package.

You can test the package locally in a different project by running the `npm link ownstak` command.

For example, to test the package locally before publishing with a Next.js project, follow these steps:

```bash
npx create-next-app@latest
cd my-app
npm i
npm link ownstak
```

Then you can run:

```bash
npx ownstak build
```

Following alias works too:

```bash
npx ownstak-cli
```

NOTE: Keep in mind that running `npm install` inside the Next.js project after `npm link ownstak` command will again override your local version with the version from NPM.

## Stable release

To release a new version of the CLI, you need to create a new release in the GitHub UI.
After the release is created, the GitHub Actions will build the CLI and publish it to the NPM under `latest` tag.

Steps to release a new version:

1. Create a new release in the [Releases](https://github.com/ownstak/ownstak-cli/releases/new) page or use existing release draft.
2. Create a new tag with the corresponding version. The current release candidate version can be found in the `package.json` file under `version` property but the release pipeline will use the version from the tag.
3. The tag name should be in the format of `v{version}`. For example, `v1.0.1`. Then click on `Create new tag` button.
4. Set the release title to same name as the tag. e.g: `v1.0.1`
5. Add, cleanup and update release notes if needed.
6. Check the `Set as the latest release ` checkbox.
7. Click on `Publish release` button.
8. The release pipeline will start. You can see the progress in the [Actions](https://github.com/ownstak/ownstak-cli/actions) page.
9. Once the release pipeline is finished, you can see the release binaries in the [Releases](https://github.com/ownstak/ownstak-cli/releases) page.
10. Done

The CI will also automatically bump the version to the next patch version and commit and push it back to the repository for a new release.

## Preview/Next release
To preview a release candidate or publish changes under a custom tag (e.g., `next`, `beta`), you can manually trigger the release workflow from any branch.

1. Go to the [Release workflow](https://github.com/OwnStak/ownstak-cli-old/actions/workflows/release.yml) page
2. Click "Run workflow"
3. Select the branch you want to release from
4. Optionally specify a version tag (`next`, `beta`, etc.)
5. Click "Run workflow"

The released version has format `{version}-next-{commit-hash}-{timestamp}`. For example, `1.0.0-next-a23sdf-1744196863`.
You can find the actual released next version in the CI logs.

## Formatting

Use Biome to format the codebase.

```bash
# Format all files in ./src
npm run format

# Check formatting without writing
npm run format:check
```

## Linting

Use Biome to lint the codebase. Linting also organizes imports and reports unused imports/variables.

```bash
# Lint and auto-fix safe issues in ./src
npm run lint

# Lint and apply unsafe fixes (use with care)
npm run lint:unsafe

# Run lint checks without writing
npm run lint:check
```
