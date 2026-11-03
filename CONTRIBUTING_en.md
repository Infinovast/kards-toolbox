# Contributing

[中文](CONTRIBUTING.md) | [English](CONTRIBUTING_en.md)

Thank you for your contribution. Issue reports and pull requests are welcome. See the [README](README_en.md) for features and usage, [Build and run (Chinese)](docs/build-and-run.md) for environment requirements, asset setup, and build commands, and [Architecture (Chinese)](docs/architecture.md) for the code structure.

## Submitting changes

1. Install Node.js 22 and npm, then run `npm ci`. Desktop development and asset-related checks also require static assets that you are authorized to use.
2. Keep each change focused on one clearly defined problem or feature. Explain how to reproduce the issue, the expected behavior, and the actual result. For interface issues, screenshots are useful after personal information has been removed.
3. Before submitting, run `npm run lint`, `npm test`, and `npm run build:desktop`. State which checks you could not run and why. Do not commit dependency directories, build output, caches, user backups, secrets, or game resource packs.
4. For a new feature, increment the patch version once and update `package.json`, both the top-level and root package versions in `package-lock.json`, and the current version in the README. Keep the Chinese and English README versions consistent. Fixes, style changes, and documentation updates do not change the version.

Documentation describes the current implementation: the README covers usage, `docs/build-and-run.md` covers development and builds, `docs/architecture.md` covers architecture, and `DESIGN.md` covers interface guidelines. Keep translations consistent with their corresponding Chinese documents.

Ensure you have the right to contribute the code and content you submit. Original contributions use the project's MIT License. When introducing third-party content, retain its copyright and license notices and update the [third-party notices](THIRD_PARTY_NOTICES_en.md) and their [Chinese counterpart](THIRD_PARTY_NOTICES.md). Do not submit game assets under the MIT License without authorization.

For sensitive vulnerabilities, follow [Reporting security issues](SECURITY_en.md).
