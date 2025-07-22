# Contributing to Multimodal Education System v2

We're excited that you're interested in contributing to the Multimodal Education System! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/cafe8601/multimodal-edu-system-v2/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - System information (OS, browser, Node.js version)
   - Screenshots if applicable

### Suggesting Features

1. Check existing feature requests in [Issues](https://github.com/cafe8601/multimodal-edu-system-v2/issues)
2. Create a new issue with the `enhancement` label
3. Describe the feature and its benefits
4. Include mockups or examples if possible

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write or update tests
5. Ensure all tests pass (`npm test`)
6. Commit with descriptive messages
7. Push to your fork
8. Open a Pull Request

## Development Setup

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL 16+
- Redis 7+

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/cafe8601/multimodal-edu-system-v2.git
cd multimodal-edu-system-v2
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start services:
```bash
docker-compose up -d
npm run dev
```

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Prefer functional programming patterns

### React Components

- Use functional components with hooks
- Implement proper prop validation
- Follow React best practices
- Ensure accessibility (WCAG 2.1 AA)

### Testing

- Write unit tests for all business logic
- Include integration tests for APIs
- Add E2E tests for critical paths
- Maintain >90% code coverage

### Git Commit Messages

Follow conventional commits format:

```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test updates
- `chore`: Build/tool updates

Example:
```
feat(auth): add multi-factor authentication

- Implement TOTP-based 2FA
- Add QR code generation
- Update user settings UI

Closes #123
```

## Code Review Process

1. All code must be reviewed before merging
2. Address all review comments
3. Ensure CI/CD passes
4. Maintain test coverage
5. Update documentation

## Testing

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

### Writing Tests

- Test file naming: `*.test.ts` or `*.spec.ts`
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies
- Test edge cases

## Documentation

- Update README.md for significant changes
- Add/update API documentation
- Include code examples
- Document configuration options
- Update architecture diagrams

## Release Process

1. Create release branch
2. Update version numbers
3. Update CHANGELOG.md
4. Create pull request
5. After review, merge to main
6. Tag release
7. Deploy to production

## Getting Help

- Join our [Discord server](https://discord.gg/multimodal-edu)
- Check [documentation](docs/)
- Ask questions in [Discussions](https://github.com/cafe8601/multimodal-edu-system-v2/discussions)
- Email: support@multimodal-edu.dev

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing to make education more accessible and effective through AI!