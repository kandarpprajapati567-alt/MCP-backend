# Security Policy

## Supported versions

This project is under active development. Security fixes are applied to the default branch; there are no formal release branches yet.

## Reporting a vulnerability

Please do not open a public issue for an undisclosed vulnerability.

Report suspected security issues privately to the repository maintainer through GitHub's private vulnerability reporting feature, if enabled. Include:
- A clear description and potential impact.
- Reproduction steps or a minimal proof of concept.
- Affected commit, endpoint, or component.
- Any suggested mitigation, if known.

Do not include real API keys, access tokens, passwords, private user data, or production database records in reports.

## Security expectations

- Keep provider credentials and privileged database keys server-side.
- Never commit environment files or secrets.
- Authenticate API requests and enforce user ownership.
- Apply database Row Level Security to user-owned records.
- Validate model-generated plans and tool inputs before execution.
- Do not expose arbitrary shell, eval, unrestricted filesystem access, or unrestricted network proxy functionality.