# Reporting security issues

[中文](SECURITY.md) | [English](SECURITY_en.md)

Verify the issue against the current source or latest release. Include the version, operating system, conditions needed to reproduce it, affected functionality, and minimal reproduction steps. The maintainer does not guarantee fix deadlines or long-term security support for older versions.

For issues involving tokens, personal data exposure, arbitrary file access, or code execution, use the hosting platform's private vulnerability reporting channel if one is enabled. If no private channel is available, open an issue that only asks for a private contact method. Do not publish vulnerability details, exploit code, or affected data. Share those materials after obtaining a private contact method.

Ordinary functional issues can be reported publicly. When sharing logs or backups, do not include real secrets, personal information, or a complete user data directory in public issues or pull requests.

During maintenance and release preparation, run `npm audit` to check dependency risks and review Electron runtime security advisories. Passing checks does not guarantee the absence of vulnerabilities. Development servers are intended for local debugging and should not be exposed directly to the public internet.
