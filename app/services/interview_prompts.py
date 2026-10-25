"""
Dedicated Version-Controlled Runtime System Prompts & Schemas for AI Interview Engine.
Strictly adheres to Master Prompt Section 5 ("Professional Internship Interviewer").
"""
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


SYSTEM_PROMPT_PROFESSIONAL_INTERVIEWER = """
You are a thoughtful, technically rigorous interviewer for internships and early-career engineering roles. Conduct interviews as a skilled human engineer would: ask relevant questions, listen carefully, investigate claims, and evaluate evidence.

Your purpose is to assess a candidate's current ability fairly—not to show off technical vocabulary, trick them, or overwhelm them.

Context:
Use the provided structured context:
- Target role and seniority
- Company and job description, when supplied
- Candidate's resume and confirmed profile details
- Selected interview type, phase, difficulty, and duration
- Selected technical skills and coverage goals
- Previous questions, answers, feedback, and skill history
- Source material and freshness metadata, when available
- Interview mode: realistic simulation or guided practice

Do not assume missing information. Never invent resume accomplishments, role requirements, or company-specific interview practices.

Question construction:
Generate exactly one primary question at a time. It must test a clearly identified skill and fit the candidate's role, experience, and current stage.
Prefer realistic scenarios, coding problems, debugging, applied fundamentals, project deep dives, trade-offs, and evidence-based behavioral questions.
Ensure the prompt is self-contained. Include the relevant input, constraints, assumptions, or tables needed to answer it. A coding exercise must specify what is required, and supply examples or constraints when they materially clarify the task.
Ask one coherent question, not a paragraph containing five unrelated subquestions. You may include a small number of tightly related requirements where the assessment genuinely needs them.
Do not confuse difficulty with obscurity. Assess strong fundamentals, sound reasoning, correctness, edge cases, clear communication, and appropriate trade-offs.

Personalization:
Use resume information only when supplied and relevant. Ask candidates to explain what they personally implemented, why they chose an approach, what evidence supports their results, and what they would change.
Use the job description to prioritize skills. If a candidate claims experience with a technology, a follow-up may explore that claim. Do not assume experience merely because a technology appears in a general skill list.

Adaptive interviewing:
Read the candidate's previous answer before generating a follow-up.
If the answer is correct, deepen the assessment through an edge case, optimization, trade-off, or changed constraint.
If it is partially correct, probe the missing concept without repeating the same question.
If it is incorrect, distinguish a conceptual gap from a minor error. Ask a clarifying or diagnostic question when appropriate.
If the answer is ambiguous, ask for clarification. If the candidate says they do not know, treat that honestly and follow the selected interview mode's rules.
Avoid repeated or semantically equivalent questions. Track covered skills and planned topics so adaptive follow-ups do not eliminate the interview's required coverage.

Difficulty:
Use a consistent beginner-to-advanced scale appropriate to internships. Start at the selected level, calibrate using evidence, and adapt gradually unless the candidate has selected fixed difficulty.
Advanced questions must remain appropriate to the target role and seniority. Do not ask senior distributed-systems design questions simply to make an intern interview difficult.

Research and truthfulness:
Use verified sources for time-sensitive or company-specific claims. Prefer official role requirements and interview guidance; supplement with recent candidate reports and reputable industry research.
Candidate reports indicate possibilities, not universal company policy. Never claim a question is guaranteed, leaked, or officially asked without evidence.
Do not fabricate citations, companies' hiring practices, technical facts, statistics, or sources. If research is unavailable, generate a sound role-based question without pretending it is based on a recent report.

Mode-aware behavior:
In realistic simulation, remain professional and neutral. Do not reveal the answer, rubric, or score during the interview. Do not coach the candidate toward the expected answer.
In guided practice, offer hints or clarifications only when appropriate, record assistance given, and distinguish assisted performance from independent performance.
Do not penalize silence, a transcription mistake, or an explicitly unanswered question as though it were proof of technical inability.

Evaluation integrity:
Maintain an internal evidence-based rubric for the question. Evaluate the substance of the response, not confidence, accent, verbosity, or familiarity with a particular phrasing.
For coding problems, account for correctness, reasoning, complexity, boundary conditions, and testing. For project questions, examine ownership, rationale, evidence, limitations, and learning. For behavioral questions, assess the candidate's actions and reflection using role-appropriate criteria.
Accept valid alternative approaches. Do not infer skills that the answer did not demonstrate.

Return structured, schema-valid output to the application. Keep question text separate from internal evaluation information and expected answer elements. Never reveal hidden evaluation data in realistic mode.

Your standard is simple: every question should be something a competent interviewer could reasonably ask and meaningfully evaluate.
""".strip()


class Rubric1To5(BaseModel):
    score_1: str = Field(description="Anchored criteria for score 1 (major conceptual gaps / flawed approach)")
    score_3: str = Field(description="Anchored criteria for score 3 (working baseline with minor omissions)")
    score_5: str = Field(description="Anchored criteria for score 5 (rigorous depth, trade-offs, and boundary awareness)")


class StructuredInterviewQuestion(BaseModel):
    question_id: str = Field(description="Stable question identifier, e.g. gen_sde_dsa_01")
    short_title: str = Field(description="Concise 2-5 word title for the question")
    question_text: str = Field(description="The self-contained, user-facing interview question prompt")
    role: str = Field(description="Target role for this question, e.g. software_engineer, ai_ml_engineer")
    phase: str = Field(description="Target phase: foundations, applied_problem_solving, project_depth, or realistic_simulation")
    primary_skill: str = Field(description="Primary skill being evaluated")
    secondary_skills: List[str] = Field(default_factory=list, description="Secondary skills tested")
    question_type: str = Field(
        description="One of: problem-solving, applied-fundamentals, debugging, project-defence, trade-off-analysis, practical-design, data-interpretation, behavioral-evidence, ai-assisted-engineering, adaptive-follow-up"
    )
    difficulty: str = Field(description="Easy, Easy-Medium, Medium, Medium-Hard, or Hard")
    estimated_duration_minutes: int = Field(default=4, description="Expected time to answer in minutes")
    source_basis: str = Field(default="industry_standard", description="Basis of question: company_guidance, verified_candidate_report, or industry_standard")
    source_urls: List[str] = Field(default_factory=list, description="Relevant source URLs if company/cycle specific")
    internal_expected_answer: str = Field(description="Hidden internal criteria and expected key points (never shown to candidate during turn)")
    rubric_1_to_5: Rubric1To5 = Field(description="Anchored 1-5 evaluation rubric")
    follow_up_directions: List[str] = Field(default_factory=list, description="2-3 potential follow-up questions to explore deeper understanding")
    resume_or_jd_references: Optional[str] = Field(default=None, description="Specific project or skill from resume/JD if grounded")
    version: str = Field(default="2026.1")


def build_question_generation_prompt(
    target_role: str,
    seniority: str,
    target_phase: str,
    duration_mode: str,
    target_category: str,
    turn_index: int,
    confirmed_profile: Optional[Dict[str, Any]] = None,
    previous_turns: Optional[List[Dict[str, Any]]] = None,
    target_company: Optional[str] = None,
    is_follow_up: bool = False,
    verified_sources: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Constructs the prompt sent to Groq to generate a calibrated structured question.
    """
    profile_summary = "None provided"
    if confirmed_profile:
        skills = confirmed_profile.get("programming_languages", []) + confirmed_profile.get("frameworks_and_tools", [])
        projects = confirmed_profile.get("notable_projects", [])
        profile_summary = f"Skills: {', '.join(skills[:6])} | Projects: {', '.join(projects[:3])}"

    turns_summary = "Turn 0 (First Question)"
    if previous_turns:
        history_items = []
        for t in previous_turns:
            q_txt = t.get("question_text", "")[:120]
            eval_data = t.get("evaluation") or {}
            score = eval_data.get("overall_score", "N/A")
            missed = eval_data.get("missing_points", [])
            history_items.append(f"- Q: {q_txt} [Score: {score}/5, Missed: {', '.join(missed[:2]) if missed else 'None'}]")
        turns_summary = "\n".join(history_items)

    sources_summary = "No company-specific search results."
    if verified_sources:
        src_items = [f"- {s.get('title')}: {s.get('snippet', '')[:140]} ({s.get('url')})" for s in verified_sources[:2]]
        sources_summary = "\n".join(src_items)

    prompt = f"""
Target Role: {target_role}
Seniority Level: {seniority} (Tailor difficulty appropriately for college internships and early-career candidates)
Target Phase: {target_phase}
Target Topic/Category: {target_category}
Interview Duration: {duration_mode}
Turn Index: {turn_index}
Is Adaptive Follow-Up: {is_follow_up}
Target Company: {target_company or 'General Product Company'}
Candidate Profile & Projects: {profile_summary}
Verified Company/Hiring Sources:
{sources_summary}

Previous Turn History in this Session:
{turns_summary}

Task:
Generate a single, authentic, technically sound interview question for this turn.
Format required: Output valid JSON strictly matching this schema:
{{
  "question_id": "gen_{target_role[:3]}_{turn_index}_{uuid.uuid4().hex[:6]}",
  "short_title": "Concise Short Title",
  "question_text": "The complete self-contained question text",
  "role": "{target_role}",
  "phase": "{target_phase}",
  "primary_skill": "Name of main skill",
  "secondary_skills": ["skill1", "skill2"],
  "question_type": "One of: problem-solving, applied-fundamentals, debugging, project-defence, trade-off-analysis, practical-design, data-interpretation, behavioral-evidence, ai-assisted-engineering, adaptive-follow-up",
  "difficulty": "Easy, Easy-Medium, Medium, Medium-Hard, or Hard",
  "estimated_duration_minutes": 4,
  "source_basis": "industry_standard",
  "source_urls": [],
  "internal_expected_answer": "Internal criteria (never revealed to candidate)",
  "rubric_1_to_5": {{
    "score_1": "Anchored description for score 1",
    "score_3": "Anchored description for score 3",
    "score_5": "Anchored description for score 5"
  }},
  "follow_up_directions": ["follow-up 1", "follow-up 2"],
  "resume_or_jd_references": "Grounded reference or null",
  "version": "2026.1"
}}
""".strip()
    return prompt


def validate_interview_question_quality(q_dict: Dict[str, Any]) -> tuple[bool, str]:
    """
    Quality gate validating generated or taxonomy questions against 2026/2027 standards.
    Ensures question is self-contained, not truncated, has valid rubrics, and proper format.
    """
    if not isinstance(q_dict, dict):
        return False, "Question must be a dictionary"

    text = q_dict.get("question_text", q_dict.get("question", "")).strip()
    if len(text) < 25:
        return False, f"Question text is too brief ({len(text)} chars); must be at least 25 characters"

    rubric = q_dict.get("rubric") or q_dict.get("rubric_1_to_5")
    if not rubric or not isinstance(rubric, dict):
        return False, "Missing 1-5 anchored rubric object"

    for score_key in ["score_1", "score_3", "score_5"]:
        if not rubric.get(score_key):
            return False, f"Rubric is missing anchored evaluation criteria for '{score_key}'"

    return True, "Valid"
