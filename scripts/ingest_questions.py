"""
Normalize question provenance and drop legacy paraphrases of curated questions.

Run from the repository root:
    python scripts/ingest_questions.py           # dry run, prints what would change
    python scripts/ingest_questions.py --write   # apply changes

Rules:
- A source URL is kept only when it resolves in data/source_registry.json.
  Questions left without a verified URL are labelled ai_generated.
- Curated wording wins. Legacy bank entries that paraphrase a curated question
  are removed so the same question cannot appear twice under different ids.
- Question text, rubrics, and answers are never rewritten.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.web_interview_service import (
    is_semantic_duplicate,
    load_source_registry,
    taxonomy_mgr,
)

TAXONOMY_DIR = Path("data/taxonomy")
LEGACY_BANK = Path("data/question_bank.json")


def _normalize_provenance(item: dict, registry: dict) -> tuple[dict, bool]:
    changed = False
    urls = [u for u in (item.get("source_urls") or []) if isinstance(u, str)]
    verified = [u for u in urls if u in registry]
    provenance_class = "source_listed" if verified else "ai_generated"

    if verified != urls:
        item["source_urls"] = verified
        changed = True

    provenance = item.get("provenance")
    if not isinstance(provenance, dict):
        provenance = {}
        item["provenance"] = provenance
        changed = True
    if provenance.get("kind") != "curated_practice":
        provenance["kind"] = "curated_practice"
        changed = True
    if provenance.get("provenance_class") != provenance_class:
        provenance["provenance_class"] = provenance_class
        changed = True
    return item, changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="apply changes instead of dry running")
    args = parser.parse_args()

    registry = load_source_registry()
    # Only curated wording counts as canonical here. The live manager also holds
    # legacy items, so filtering on provenance keeps each legacy question from
    # matching itself.
    curated_texts = [
        str(q.get("question", ""))
        for q in taxonomy_mgr.questions
        if q.get("question")
        and q.get("provenance", {}).get("kind") != "generated_practice"
    ]

    changed_files = 0
    changed_questions = 0
    for path in sorted(TAXONOMY_DIR.glob("*.json")):
        items = json.loads(path.read_text(encoding="utf-8"))
        file_changed = False
        for item in items:
            _, changed = _normalize_provenance(item, registry)
            if changed:
                changed_questions += 1
                file_changed = True
        if file_changed:
            changed_files += 1
            if args.write:
                path.write_text(
                    json.dumps(items, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
            print(f"{path}: {len(items)} questions, provenance updated")

    dropped: list[str] = []
    if LEGACY_BANK.exists():
        legacy = json.loads(LEGACY_BANK.read_text(encoding="utf-8"))
        kept = []
        for item in legacy:
            if is_semantic_duplicate(str(item.get("question", "")), curated_texts):
                dropped.append(str(item.get("id", "?")))
                continue
            kept.append(item)
        if dropped:
            print(f"Legacy paraphrases of curated questions: {len(dropped)}")
            for qid in dropped:
                print(f"  {qid}")
            if args.write:
                LEGACY_BANK.write_text(
                    json.dumps(kept, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )

    mode = "applied" if args.write else "dry run"
    print(
        f"{mode}: {changed_questions} curated questions touched across "
        f"{changed_files} files; {len(dropped)} legacy items flagged for removal."
    )
    if not args.write:
        print("Re-run with --write to apply.")


if __name__ == "__main__":
    main()
