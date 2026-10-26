"""
Report on the live question bank: coverage, difficulty mix, provenance, and
near-duplicates.

Run from the repository root:
    python scripts/question_report.py

Read-only. It loads exactly what the API loads, so the numbers here match what
a candidate can actually be asked.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.web_interview_service import (
    SEMANTIC_DUP_THRESHOLD,
    is_semantic_duplicate,
    load_source_registry,
    taxonomy_mgr,
)

TAXONOMY_DIR = Path("data/taxonomy")
LEGACY_BANK = Path("data/question_bank.json")


def _by_topic() -> Counter:
    return Counter(
        q.get("category_key") or "unknown" for q in taxonomy_mgr.questions
    )


def _by_difficulty() -> Counter:
    return Counter(str(q.get("difficulty") or "Medium") for q in taxonomy_mgr.questions)


def _by_provenance() -> Counter:
    return Counter(
        str(q.get("provenance_class") or "ai_generated") for q in taxonomy_mgr.questions
    )


def _near_duplicates() -> list[tuple[str, str, float]]:
    questions = taxonomy_mgr.questions
    found: list[tuple[str, str, float]] = []
    for i, left in enumerate(questions):
        for right in questions[i + 1:]:
            if is_semantic_duplicate(
                str(left.get("question", "")), [str(right.get("question", ""))]
            ):
                found.append(
                    (
                        str(left.get("id", "")),
                        str(right.get("id", "")),
                        SEMANTIC_DUP_THRESHOLD,
                    )
                )
    return found


def _unverified_urls() -> list[tuple[str, str]]:
    registry = load_source_registry()
    bad: list[tuple[str, str]] = []
    for path in sorted(TAXONOMY_DIR.glob("*.json")):
        for item in json.loads(path.read_text(encoding="utf-8")):
            for url in item.get("source_urls") or []:
                if isinstance(url, str) and url and url not in registry:
                    bad.append((str(item.get("id", path.name)), url))
    return bad


def main() -> None:
    questions = taxonomy_mgr.questions
    legacy = sum(1 for q in questions if q.get("provenance", {}).get("kind") == "generated_practice")
    print(f"Loaded questions: {len(questions)} ({len(questions) - legacy} curated, {legacy} legacy)")

    print("\nBy topic:")
    for key, count in _by_topic().most_common():
        print(f"  {key:32} {count}")

    print("\nBy difficulty:")
    for key, count in _by_difficulty().most_common():
        print(f"  {key:32} {count}")

    print("\nBy provenance class:")
    for key, count in _by_provenance().most_common():
        print(f"  {key:32} {count}")

    dupes = _near_duplicates()
    print(f"\nNear-duplicate pairs (Jaccard >= {SEMANTIC_DUP_THRESHOLD}): {len(dupes)}")
    for left, right, _ in dupes:
        print(f"  {left} <-> {right}")

    bad_urls = _unverified_urls()
    print(f"\nSource URLs missing from the verified registry: {len(bad_urls)}")
    for qid, url in bad_urls:
        print(f"  {qid}: {url}")

    if LEGACY_BANK.exists():
        raw_legacy = json.loads(LEGACY_BANK.read_text(encoding="utf-8"))
        print(f"\nRaw legacy bank entries on disk: {len(raw_legacy)}")


if __name__ == "__main__":
    main()
