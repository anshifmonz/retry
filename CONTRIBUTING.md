# Contributing to Retry

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to this project. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)

## Code of Conduct

This project and everyone participating in it is governed by basic principles of respect and professionalism. By participating, you are expected to uphold this code.

**Be respectful:**
- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

When creating a bug report, include as many details as possible:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Call retry with options '...'
2. API fails with '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Code sample**
```typescript
// Minimal reproducible example
const result = await retry(
  () => fetch('...'),
  { retries: 3 }
);
```

**Environment:**
- Node.js version: [e.g. 18.0.0]
- TypeScript version: [e.g. 5.0.0]
- OS: [e.g. macOS, Ubuntu]

**Additional context**
Any other context about the problem.
```

### Suggesting Features

Feature requests are welcome! Before suggesting a feature:

1. **Check existing issues** - Someone might have already suggested it
2. **Consider the scope** - Does it fit the library's goals?
3. **Provide use cases** - Why is this feature valuable?

**Feature Request Template:**

```markdown
**Is your feature request related to a problem?**
A clear description of the problem. Ex. I'm frustrated when [...]

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Other solutions or features you've considered.

**Use case**
How would you use this feature? Provide a code example if possible.

**Additional context**
Any other context or screenshots about the feature request.
```

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Make your changes** with clear, focused commits
3. **Add tests** if you're adding functionality
4. **Update documentation** if you're changing behavior
5. **Run tests** to ensure everything passes
6. **Submit a pull request** with a clear description

**Good PR titles:**
- ✅ `feat: Add support for custom backoff strategies`
- ✅ `fix: Handle edge case when signal is already aborted`
- ✅ `docs: Clarify attemptTimeout behavior`
- ✅ `test: Add tests for retry on empty arrays`

**Bad PR titles:**
- ❌ `Update retry.ts`
- ❌ `Fix bug`
- ❌ `Changes`

## Development Setup

1. **Clone your fork:**
```bash
git clone https://github.com/YOUR_USERNAME/retry.git
cd retry
```

2. **Install dependencies:**
```bash
npm install
# or
yarn install
```

3. **Run tests:**
```bash
npm test
```

## Testing

We use a comprehensive test suite to ensure reliability. All contributions should include tests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Writing Tests

Tests should be clear, focused, and cover edge cases:

```typescript
// Good test
console.log('Test: Should retry on 5xx errors');
const api = createStatusCodeAPI([503, 500, 200]);
const result = await retry(() => api(), {
  retries: 3,
  shouldRetry: (error) => error.statusCode >= 500
});
// Assert expected behavior

// Tests should:
// - Have descriptive names
// - Test one thing at a time
// - Cover success and failure cases
// - Include edge cases
```

### Test Coverage Goals

- **Core functionality:** 100%
- **Error handling:** 100%
- **Edge cases:** As comprehensive as possible

## Code Style

We follow standard TypeScript best practices:

### General Guidelines

- **Use TypeScript** - Full type safety, no `any` unless absolutely necessary
- **Prefer `const`** over `let` when possible
- **Use meaningful names** - Descriptive variable and function names
- **Keep functions small** - Each function should do one thing well
- **Comment complex logic** - Explain the "why", not the "what"

### Formatting

```typescript
// ✅ Good
export async function retry<T, E extends Error = Error>(
  fn: (attempt: number, attemptSignal?: AbortSignal) => Promise<RetryResult<T>>,
  options: RetryOptions<E> = {}
): Promise<RetryPromiseResult<T, E>> {
  // Implementation
}

// ❌ Bad - inconsistent spacing, unclear types
export async function retry(fn:any,options?:any){
  // Implementation
}
```

### TypeScript Conventions

- Use explicit types for public APIs
- Prefer interfaces for object shapes
- Use generics for type flexibility
- Document complex types with comments

```typescript
// ✅ Good
interface RetryOptions<E> {
  /** Maximum number of retry attempts */
  retries?: number;
  
  /** Base delay between retries in milliseconds */
  delay?: number;
}

// ❌ Bad - no documentation, unclear purpose
interface Options {
  r?: number;
  d?: number;
}
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear history:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `chore`: Maintenance tasks

### Examples

```bash
# Good commits
feat: add custom jitter strategy options
fix: handle edge case when signal is already aborted
docs: clarify per-attempt timeout behavior
test: add tests for falsy result retry logic

# With body
feat: add retry on custom predicate

Allow users to define custom predicates for determining
when to retry based on the result value, not just errors.

Closes #42

# Breaking changes
feat!: change result object structure

BREAKING CHANGE: The result object now always includes
`attempts` field. Update code that destructures results.
```

## Pull Request Process

1. **Update documentation** for any API changes
2. **Add tests** for new functionality
3. **Ensure all tests pass** - Run `npm test`
4. **Update CHANGELOG.md** if applicable
5. **Link related issues** in the PR description
6. **Wait for review** - A maintainer will review your PR

### PR Checklist

Before submitting, ensure:

- [ ] Code follows the style guidelines
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated
- [ ] Commit messages follow conventions
- [ ] No unnecessary dependencies added
- [ ] Code is backward compatible (or breaking change is documented)

## Questions?

Feel free to:
- Open an issue with the `question` label
- Start a discussion in GitHub Discussions
- Reach out on [LinkedIn](https://linkedin.com/in/anshifmonz)

## Recognition

Contributors will be recognized in:
- The project README
- Release notes for significant contributions
- GitHub's contributors page

Thank you for contributing! 🙌

---

**Remember:** Good contributions don't have to be code. Documentation improvements, bug reports, and feature suggestions are all valuable!
