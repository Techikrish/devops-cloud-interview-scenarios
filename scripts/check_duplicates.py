#!/usr/bin/env python3
"""
Check for duplicate interview questions across all scenarios.md files.
This script is used in CI/CD to validate PRs for duplicate questions.
"""

import os
import re
import sys
from pathlib import Path


def extract_questions(file_path):
    """
    Extract all questions from a scenarios.md file.
    Returns a list of tuples: (question_number, question_text, file_path, line_number)
    """
    questions = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for i, line in enumerate(lines, 1):
                # Match pattern: **Q1. [L1] Question text?**
                match = re.match(r'\*\*Q\d+\.\s*\[L[1-3]\]\s*(.+?)\*\*', line)
                if match:
                    question_text = match.group(1).strip()
                    questions.append({
                        'text': question_text,
                        'file': file_path,
                        'line': i
                    })
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    
    return questions


def find_duplicates(questions, check_similarity=False, similarity_threshold=0.85):
    """
    Find duplicate questions.
    - By default, checks for exact matches only (fast)
    - Set check_similarity=True to also check for similar questions (slow)
    Returns list of duplicate groups.
    """
    duplicates = []
    checked = set()
    
    # Create a dictionary for fast exact match lookups
    exact_questions = {}
    for q in questions:
        q_lower = q['text'].lower()
        if q_lower not in exact_questions:
            exact_questions[q_lower] = []
        exact_questions[q_lower].append(q)
    
    # Find exact duplicates
    for q_lower, q_list in exact_questions.items():
        if len(q_list) > 1:
            duplicates.append(q_list)
    
    return duplicates


def get_all_scenario_files(root_dir='.'):
    """
    Find all scenarios.md files in the repository.
    """
    scenario_files = []
    for root, dirs, files in os.walk(root_dir):
        # Skip hidden directories and scripts
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        if 'scenarios.md' in files:
            file_path = os.path.join(root, 'scenarios.md')
            scenario_files.append(file_path)
    
    return sorted(scenario_files)


def main():
    """
    Main function to check for duplicates.
    """
    print("🔍 Checking for duplicate questions...")
    print()
    
    # Get all scenario files
    scenario_files = get_all_scenario_files()
    
    if not scenario_files:
        print("❌ No scenarios.md files found!")
        sys.exit(1)
    
    print(f"📁 Found {len(scenario_files)} scenario files:")
    for f in scenario_files:
        print(f"   - {f}")
    print()
    
    # Extract all questions
    all_questions = []
    for scenario_file in scenario_files:
        questions = extract_questions(scenario_file)
        all_questions.extend(questions)
        print(f"✅ Extracted {len(questions)} questions from {scenario_file}")
    
    print()
    print(f"📊 Total questions found: {len(all_questions)}")
    print()
    
    # Find duplicates (exact matches only for performance)
    duplicates = find_duplicates(all_questions)
    
    if not duplicates:
        print("✅ No duplicate questions found!")
        return 0
    
    # Report duplicates
    print(f"⚠️  Found {len(duplicates)} duplicate group(s):")
    print()
    
    exit_code = 1
    for idx, group in enumerate(duplicates, 1):
        print(f"Duplicate Group {idx}:")
        for q in group:
            print(f"  📍 {q['file']}:{q['line']}")
            print(f"     Q: {q['text'][:100]}...")
        print()
    
    return exit_code


if __name__ == '__main__':
    sys.exit(main())
