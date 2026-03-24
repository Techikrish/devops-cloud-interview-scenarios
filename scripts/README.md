# DevOps Interview Scenarios - Scripts

This directory contains utility scripts for maintaining the repository.

## Check Duplicates Script

The `check_duplicates.py` script validates that all interview questions across all `scenarios.md` files are unique or significantly different.

### Usage

#### Local Development

Run the script locally before pushing:

```bash
python scripts/check_duplicates.py
```

#### Output Example (No Duplicates)
```
🔍 Checking for duplicate questions...

📁 Found 6 scenario files:
   - aws/scenarios.md
   - ci-cd/scenarios.md
   - docker/scenarios.md
   - general-devops/scenarios.md
   - linux-sre/scenarios.md
   - networking/scenarios.md

✅ Extracted 120 questions from aws/scenarios.md
✅ Extracted 120 questions from ci-cd/scenarios.md
...

📊 Total questions found: 720

✅ No duplicate questions found!
```

#### Output Example (Duplicates Found)
```
⚠️  Found 2 duplicate group(s):

Duplicate Group 1:
  📍 kubernetes/scenarios.md:45
     Q: How do you implement RBAC in Kubernetes?...
  📍 security/scenarios.md:120
     Q: How do you implement RBAC in Kubernetes?...
```

### How It Works

1. **Extracts** all questions from `scenarios.md` files using regex pattern matching (`**Q#. [L#] Question?**`)
2. **Normalizes** questions by converting to lowercase for comparison
3. **Detects exact duplicates** (case-insensitive)
4. **Reports** duplicate groups with file locations and line numbers

### Performance

The script uses optimized algorithms for fast performance:
- Uses dictionary-based lookups instead of nested loops
- O(n) time complexity for exact duplicate detection
- Completes in milliseconds even with hundreds of questions
- Runs efficiently in GitHub Actions CI/CD pipelines

### Continuous Integration

The GitHub Actions workflow `.github/workflows/check_duplicates.yml` automatically:

1. **Triggers** on any PR that modifies `scenarios.md` files
2. **Runs** the duplicate check script
3. **Comments on the PR** with results if duplicates are found
4. **Blocks the PR** from merging until duplicates are resolved

### Contributing

When adding new questions:

1. Run `python scripts/check_duplicates.py` locally before committing
2. Ensure no duplicates are reported
3. Submit your PR - the CI will validate again automatically

### Requirements

- Python 3.8+
- No external dependencies (uses only Python standard library)
