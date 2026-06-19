# Changelog
- Each package has its own CHANGELOG at `packages/*/CHANGELOG.md`. Confidence: 0.90
- New entries always go under `## [Unreleased]` section. Confidence: 0.95
- Before adding entries, read the full `[Unreleased]` section to see which subsections already exist. Confidence: 0.90
- Append to existing subsections (e.g., `### Fixed`); do not create duplicates. Confidence: 0.90
- NEVER modify already-released version sections (e.g., `## [0.12.2]`); each version section is immutable once released. Confidence: 0.95
- Internal changes attribution: `Fixed foo bar ([#123](https://github.com/badlogic/pi-mono/issues/123))`. Confidence: 0.85
- External contributions attribution: `Added feature X ([#456](...) by [@username](...))`. Confidence: 0.85
