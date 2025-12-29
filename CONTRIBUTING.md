# Contributing to NodeRef

First off, thanks for taking the time to contribute! :tada:

The following is a set of guidelines for contributing to NodeRef. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Getting Started

Please refer to the **Development** section in our [README.md](./README.md) for instructions on how to set up your local development environment.

We use `pnpm` for package management and a monorepo structure:
- **apps/backend**: Node.js backend
- **apps/renderer**: React/Vite frontend
- **packages/contracts**: Shared TypeScript types

## Pull Requests

1. Fork the repo and create your branch from `main`.
2. run `pnpm install:all` to ensure your environment is ready.
3. Make sure code is formatted (`pnpm format`) and linted (`pnpm lint`).
4. Describe your changes clearly in the PR description.

## Reporting Issues

- Search existing issues before creating a new one.
- Use a clear and descriptive title.
- Include steps to reproduce the issue.
- Include screenshots/GIFs for UI issues.

## Licensing

By contributing, you agree that your contributions will be licensed under the project's [Apache 2.0 License](./LICENSE).
