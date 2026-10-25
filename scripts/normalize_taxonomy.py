"""
Normalize curated taxonomy files into the canonical runtime shape.

Run from the repository root:
    python scripts/normalize_taxonomy.py

The script is idempotent: it rewrites data/taxonomy/*.json in place with a
stable key order, canonical `category` keys, a flattened `concepts` list,
unified `score_1/score_3/score_5` rubric keys, and truthful provenance.

Nothing here invents a source claim. Questions that previously carried
`company_guidance` or `verified_candidate_report` are downgraded to
`public_interview_guidance` / `curated_taxonomy` because no verifiable
employer question record exists for them.
"""
from __future__ import annotations

import json
from pathlib import Path

TAXONOMY_DIR = Path("data/taxonomy")

# Canonical category key per question id. These keys are the single source of
# truth for deterministic blueprint selection (see CATEGORY_ALIASES in
# app/services/web_interview_service.py).
CATEGORY_BY_ID = {
    "sde_dsa_001": "dsa_hashing",
    "sde_dsa_002": "dsa_two_pointers",
    "sde_core_001": "core_fundamentals",
    "sde_core_002": "core_fundamentals",
    "sde_debug_001": "applied_problem_solving",
    "sde_design_001": "system_design_architecture",
    "sde_ai_001": "system_tradeoffs",
    "aiml_foundations_001": "ml_foundations",
    "aiml_metrics_001": "ml_metrics",
    "aiml_dl_001": "ml_foundations",
    "aiml_rag_001": "rag",
    "aiml_agentic_001": "agentic_ai",
    "aiml_langgraph_001": "langgraph",
    "aiml_rag_chunking_001": "rag",
    "aiml_llm_eval_001": "llm_eval_latency",
    "aiml_latency_cost_001": "llm_eval_latency",
    "aiml_agent_debug_001": "agentic_ai",
    "backend_api_001": "backend_api",
    "backend_db_001": "backend_db",
    "frontend_state_001": "frontend_state",
    "frontend_perf_001": "frontend_perf",
    "fullstack_trace_001": "backend_diagnostics",
    "beh_star_001": "behavioral_failure",
    "beh_star_002": "behavioral_collaboration",
    "proj_deep_001": "project_deep_dive",
    "ds_sql_001": "sql",
    "ds_abtest_001": "ab_testing",
    "ds_stats_001": "stats",
    "devops_cicd_001": "devops_cicd",
    "qa_auto_001": "qa_automation",
    "sec_owasp_001": "sec_owasp",
}

# Extra concept keywords derived from primary/secondary skills. Kept small and
# explicit so dedup has meaningful overlap signal without over-fitting.
EXTRA_CONCEPTS_BY_ID = {
    "sde_dsa_001": ["hash set", "linear time", "sequence start"],
    "sde_dsa_002": ["prefix sum", "sliding window", "subarray sum"],
    "sde_core_001": ["btree", "index", "query plan"],
    "sde_core_002": ["thread", "race condition", "mutex"],
    "sde_debug_001": ["latency", "connection pool", "tracing"],
    "sde_design_001": ["idempotency", "unique constraint", "retry"],
    "sde_ai_001": ["gil", "lock", "concurrency"],
    "aiml_foundations_001": ["data leakage", "cross validation", "distribution shift"],
    "aiml_metrics_001": ["roc auc", "pr auc", "class imbalance"],
    "aiml_dl_001": ["vanishing gradient", "residual connection", "initialization"],
    "aiml_rag_001": ["rag", "vector search", "chunking", "hallucination"],
    "aiml_agentic_001": ["agent loop", "tool calling", "termination", "idempotency"],
    "aiml_langgraph_001": ["stategraph", "checkpointer", "human in the loop"],
    "aiml_rag_chunking_001": ["semantic chunking", "reranker", "hnsw", "retrieval"],
    "aiml_llm_eval_001": ["llm as judge", "position bias", "golden dataset"],
    "aiml_latency_cost_001": ["ttft", "tpot", "kv cache", "speculative decoding"],
    "aiml_agent_debug_001": ["tool schema", "guardrail", "loop detection"],
    "backend_api_001": ["jwt", "session", "auth"],
    "backend_db_001": ["acid", "isolation level", "transaction"],
    "frontend_state_001": ["abortcontroller", "debounce", "race condition"],
    "frontend_perf_001": ["core web vitals", "lcp", "cls", "image optimization"],
    "fullstack_trace_001": ["optimistic ui", "request lifecycle", "transaction"],
    "beh_star_001": ["star", "failure", "ownership"],
    "beh_star_002": ["conflict", "collaboration", "disagree and commit"],
    "proj_deep_001": ["trade off", "bottleneck", "architecture decision"],
    "ds_sql_001": ["window function", "cte", "ranking"],
    "ds_abtest_001": ["sample ratio mismatch", "peeking", "novelty effect"],
    "ds_stats_001": ["p value", "effect size", "hypothesis test"],
    "devops_cicd_001": ["blue green", "canary", "zero downtime migration"],
    "qa_auto_001": ["test pyramid", "flaky test", "ci reliability"],
    "sec_owasp_001": ["owasp", "sql injection", "idor", "bola"],
}

# Truthful provenance per id. Every curated question is authored practice
# material derived from a public reference, never a verbatim employer question.
PROVENANCE_BASIS_BY_ID = {
    "aiml_foundations_001": ("public_interview_guidance", "ai_ml"),
    "beh_star_001": ("public_interview_guidance", "behavioral"),
    "beh_star_002": ("public_interview_guidance", "behavioral"),
}

DEFAULT_BASIS = "curated_taxonomy"

RUBRIC_ALIASES = {
    "1": "score_1",
    "3": "score_3",
    "5": "score_5",
    "score_1": "score_1",
    "score_3": "score_3",
    "score_5": "score_5",
}


def _clean(value: str) -> str:
    return " ".join(str(value).split()).strip()


def _concepts_for(q: dict) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    def add(item: str) -> None:
        text = _clean(item)
        if not text:
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        ordered.append(text)

    add(q.get("primary_skill", ""))
    for skill in q.get("secondary_skills", []) or []:
        add(skill)
    for concept in EXTRA_CONCEPTS_BY_ID.get(q["id"], []):
        add(concept)
    for concept in q.get("expected_concepts", []) or []:
        add(concept)
    return ordered


def normalize_question(q: dict) -> dict:
    qid = q["id"]
    if qid not in CATEGORY_BY_ID:
        raise SystemExit(f"Missing canonical category mapping for {qid}")

    raw_rubric = q.get("rubric_1_to_5") or {}
    rubric = {}
    for key, value in raw_rubric.items():
        canonical = RUBRIC_ALIASES.get(str(key))
        if canonical:
            rubric[canonical] = value
    for required in ("score_1", "score_3", "score_5"):
        if required not in rubric:
            raise SystemExit(f"{qid} rubric missing {required} after normalization")
    rubric = {k: rubric[k] for k in ("score_1", "score_3", "score_5")}

    basis, family = PROVENANCE_BASIS_BY_ID.get(
        qid, (q.get("source_basis") or DEFAULT_BASIS, q.get("role", ""))
    )
    if basis not in {
        "industry_standard",
        "public_interview_guidance",
        "public_technical_reference",
        "curated_taxonomy",
        "resume_grounded",
        "generated_practice",
    }:
        basis = DEFAULT_BASIS

    normalized = {
        "id": qid,
        "short_title": q.get("short_title", ""),
        "question": q.get("question", ""),
        "role": q.get("role", ""),
        "phase": q.get("phase", ""),
        "question_type": q.get("question_type", "problem-solving"),
        "category": CATEGORY_BY_ID[qid],
        "primary_skill": q.get("primary_skill", ""),
        "secondary_skills": q.get("secondary_skills", []),
        "concepts": _concepts_for(q),
        "difficulty": q.get("difficulty", "Medium"),
        "estimated_duration_minutes": q.get("estimated_duration_minutes", 4),
        "source_basis": basis,
        "source_urls": q.get("source_urls", []),
        "provenance": {
            "kind": "curated_practice",
            "basis": basis,
            "family": family,
            "note": (
                "Authored practice question derived from public interview guidance and "
                "technical references. Not a verbatim interview question from any company."
            ),
        },
        "internal_expected_answer": q.get("internal_expected_answer", ""),
        "rubric_1_to_5": rubric,
        "follow_up_directions": q.get("follow_up_directions", []),
        "version": q.get("version", "2026.1"),
    }
    return normalized


def main() -> None:
    total = 0
    for path in sorted(TAXONOMY_DIR.glob("*.json")):
        questions = json.loads(path.read_text(encoding="utf-8"))
        normalized = [normalize_question(q) for q in questions]
        path.write_text(
            json.dumps(normalized, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        total += len(normalized)
        print(f"{path}: {len(normalized)} questions normalized")
    print(f"Done. {total} questions normalized.")


if __name__ == "__main__":
    main()
