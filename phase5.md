# OPENCODE MASTER PROMPT — Build a Real, Source-Grounded Interview Preparation System

Act as a senior full-stack engineer, interview-question researcher, technical interviewer, and AI evaluation engineer. Work directly in my existing AI Interview Coach repository.

The current questions are repetitive, generic, poorly categorized, and disconnected from real interview preparation. Rebuild the question engine, interview flow, and final feedback so the product works like a serious interview preparation tool—not a demo chatbot.

This is a private project for me and a small group of people. Prioritize correctness, real functionality, source quality, and useful learning over public deployment or unnecessary infrastructure.

**Do not stop at research or prompt editing. Inspect the code, implement the changes, and verify the actual application end to end.**

## PHASE 1 — Research actual interview question banks

Start by inspecting the repository, `AGENTS.md`, existing question data, prompts, API routes, database models, interview orchestration, scoring, resume parsing, and frontend flows. Record the current baseline and identify duplicates, missing categories, unsupported claims, and broken interactions.

Use the following topic-specific question resources as the starting source registry. These are educational interview question collections, not interview-experience articles.

### Verified GeeksforGeeks question-bank URLs

**Core computer science**

- Computer Science Subjects: https://www.geeksforgeeks.org/computer-science-fundamentals/computer-science-subjects-interview-questions/
- OOP: https://www.geeksforgeeks.org/interview-prep/oops-interview-questions/
- Operating Systems: https://www.geeksforgeeks.org/operating-systems/operating-systems-interview-questions/
- DBMS: https://www.geeksforgeeks.org/dbms/commonly-asked-dbms-interview-questions/
- SQL: https://www.geeksforgeeks.org/sql/sql-interview-questions/
- Computer Networks: https://www.geeksforgeeks.org/computer-networks/commonly-asked-computer-networks-interview-questions-set-1/
- Software Engineering: https://www.geeksforgeeks.org/software-engineering/software-engineering-interview-questions-and-answers/

**Programming and DSA**

- Data Structures: https://www.geeksforgeeks.org/dsa/commonly-asked-data-structure-interview-questions-set-1/
- Java: https://www.geeksforgeeks.org/java/java-interview-questions/
- Python: https://www.geeksforgeeks.org/python/python-interview-questions/
- JavaScript: https://www.geeksforgeeks.org/javascript/javascript-interview-questions/

**AI, machine learning, and system design**

- Machine Learning: https://www.geeksforgeeks.org/machine-learning/machine-learning-interview-questions/
- Deep Learning: https://www.geeksforgeeks.org/deep-learning/deep-learning-interview-questions/
- System Design: https://www.geeksforgeeks.org/system-design/most-commonly-asked-system-design-interview-problems-questions/
- System Design question collection: https://www.geeksforgeeks.org/system-design/amazon-system-design-interview-questions/

These links are a starting registry, not proof that every page is current or every listed question has been independently verified. Check that each URL is accessible, identify its actual title and coverage, record the last-verified date, and discover additional official topic-specific collections for missing subjects. If a link has moved, find the correct replacement rather than inventing one.

### Additional authoritative references

- Amazon software-development interview topics: https://amazon.jobs/content/en/how-we-hire/interview-prep/software-development-topics
- Microsoft student interviewing guidance: https://careers.microsoft.com/v2/global/en/hiring-tips/student-interviewing
- LeetCode practice and problem discussions: https://leetcode.com/discuss/
- AWS explanation of RAG: https://aws.amazon.com/what-is/retrieval-augmented-generation/
- LangChain documentation: https://docs.langchain.com/
- LangGraph documentation: https://docs.langchain.com/oss/python/langgraph/overview
- Model Context Protocol documentation: https://modelcontextprotocol.io/

Use official documentation to validate technical concepts, frameworks, and expected implementation behavior. Use educational question banks to identify topic coverage and common interview-style questions. Use candidate reports only as supplementary evidence of reported interview experiences, never as substitutes for topic-wise question banks.

For every source, store its title, publisher, URL, topic, source type, last-verified date, and any relevant usage restrictions. If a source is unavailable, mark it unavailable and investigate a replacement. Never fabricate citations, question origins, or verification status.

Do not bulk-copy entire proprietary question banks. Store source references and concise metadata, and create original or clearly adapted practice questions where full reproduction is not permitted. Keep the source provenance attached to every imported or adapted item.

## PHASE 2 — Create a proper question taxonomy

Build a structured question library, not one large prompt containing hundreds of unrelated questions.

Support these categories and their relevant subcategories:

**Software Engineering / SDE**
- DSA: arrays, strings, hashing, linked lists, stacks, queues, trees, graphs, heaps, recursion, backtracking, greedy algorithms, dynamic programming, and complexity.
- Programming languages: Java, Python, C/C++, JavaScript, and TypeScript.
- OOP and language internals.
- DBMS, SQL, indexes, transactions, normalization, and query optimization.
- Operating systems, concurrency, synchronization, and memory.
- Computer networking, HTTP, DNS, TCP/IP, and APIs.
- Debugging, testing, code review, Git, and practical engineering.
- Machine coding and internship-appropriate design problems.

**AI/ML and Data Science**
- Mathematics, statistics, probability, and ML fundamentals.
- Data preparation, feature engineering, leakage, overfitting, and model evaluation.
- Deep learning, neural networks, CNNs, transformers, NLP, and computer vision.
- Python, NumPy, pandas, scikit-learn, PyTorch, and TensorFlow when relevant.
- Generative AI, LLMs, embeddings, vector databases, and structured outputs.
- RAG: chunking, retrieval, reranking, grounding, citations, and evaluation.
- Agentic AI: planning, tool calling, memory, state, retries, orchestration, and termination.
- LangChain, LangGraph, MCP, tracing, and checkpointing.
- LLM evaluation, hallucination analysis, security, deployment, latency, cost, and monitoring.
- Data analysis, SQL, statistics, experiments, and business metrics.

**Additional tracks**
- Backend, frontend, and full-stack engineering.
- Cloud, DevOps, and CI/CD.
- QA and test automation.
- Cybersecurity when a credible question source is available.
- Behavioral and project-based interviews.
- Resume-based interviews.

Do not expose every category to every candidate. Choose sections based on the selected role, job description, seniority, resume, and interview type. An SDE interview should not automatically contain advanced agentic-AI questions; an AI engineering interview should not be dominated by unrelated frontend trivia.

For each section, define learning objectives, prerequisites, question types, difficulty levels, and an evaluation rubric.

## PHASE 3 — Eliminate random and repetitive questions

This is a critical requirement.

Never ask a question merely because it appeared in the model's latest output. Select questions using the candidate's interview plan and the structured question repository.

Before each interview, build a coverage blueprint containing:
- Target skills and their priority.
- Planned question types and difficulty.
- Relevant resume claims and job requirements.
- Questions already asked in this session.
- Recent questions the candidate has already practiced.
- Time reserved for adaptive follow-ups.

Use stable question IDs and semantic deduplication. Detect paraphrases of existing questions, not only exact text matches. Track the concepts assessed by each question so different wording does not disguise repetition.

Do not repeat a question within the same session. Avoid recent repeats unless the user explicitly selects revision mode. If a repeated question is intentionally used to measure improvement, record that reason and compare the new response with the earlier one.

Choose questions to fill uncovered skill gaps while maintaining the planned interview coverage. Follow-ups may investigate a previous answer but must not consume the entire interview or repeatedly ask the same concept.

For a short drill, focus on a few skills. For a full mock interview, cover a deliberate, role-appropriate range. Do not generate arbitrary question counts to make a session appear substantial.

If no suitable question is available, retrieve or validate a suitable source-backed question or generate a clearly labelled practice question. Never silently substitute an unrelated generic question.

## PHASE 4 — Separate sourced questions from generated questions

Maintain three distinct question types:

1. **Source-backed question:** A question whose wording or problem can be traced to an accessible source. Store its source URL and the applicable usage rights.
2. **Adapted practice question:** An original or modified question inspired by a verified topic or problem pattern. Link its reference source and label it as an adaptation.
3. **Resume-generated question:** A question created from the candidate's confirmed resume, target role, job description, and relevant technical requirements.

Never label an AI-generated question as an actual question asked by Google, Amazon, Microsoft, or another company without direct supporting evidence.

For generated questions, record which resume claim, role requirement, or source-backed concept motivated the question. Keep source metadata separate from the generated wording.

Create a local source registry and question database using the existing persistence architecture. Add import scripts or seed data that can be rerun safely without creating duplicate records.

## PHASE 5 — Build a truly personalized resume-based interview

If a dedicated Resume-Based Interview option does not exist, implement it.

Parse the uploaded resume, show the extracted skills, projects, tools, experience, and achievements, and let the user correct and confirm them before starting.

Generate the interview plan from the confirmed resume, selected role, target company if provided, job description if provided, and relevant question taxonomy.

For each project, investigate the candidate's actual claims: architecture, personal contribution, technology choices, data, implementation details, evaluation, performance, failures, limitations, and trade-offs. Ask follow-ups based on what the candidate actually says.

Do not invent project results, tools, metrics, or responsibilities. When a claim is unclear, ask a fair clarification instead of assuming it is true.

The resulting questions should be unique to the candidate's evidence—not generic templates with project names inserted.

## PHASE 6 — Make the interviewer behave like a real interviewer

Ask one primary question at a time. Listen to the answer, reason about its content, and choose the next turn based on what the candidate demonstrated.

If the answer is correct, probe a useful edge case, alternative, or trade-off. If it is incomplete, investigate the missing concept. If it is incorrect, identify the misconception and decide whether a diagnostic follow-up is appropriate.

Keep the conversation natural, concise, and professional. Avoid repetitive praise, robotic acknowledgements, unrelated follow-ups, and reading a fixed list without reacting to answers.

Maintain a persistent session state with the current question, completed answers, planned coverage, difficulty, follow-up history, and completion status.

In realistic mode, hide hints, scores, and model answers until the debrief. In guided practice, provide appropriate assistance and record when it was used. Preserve confirmed answers during recoverable failures and prevent duplicate submissions.

## PHASE 7 — Replace generic scoring and feedback

Evaluate each answer against a question-specific rubric, not a single expected-answer string.

For each question, explain:
- What the candidate got right.
- What was incomplete or technically incorrect.
- Evidence from the actual answer.
- Why the missing concept matters.
- A stronger answer tailored to the question and the candidate's confirmed background.
- Why the revised answer is better.

For coding, include the approach, correctness, complexity, edge cases, and tests. For OOP, explain the relevant principles accurately. For SQL, show the query logic and important edge cases. For ML and AI, explain the methodology, evaluation, and trade-offs. For project questions, use only verified candidate details.

Provide specific grammar and sentence-structure feedback where appropriate. Distinguish transcription errors from genuine language mistakes, and never penalize accent or technical ability because of unreliable speech recognition.

At the end, show each question alongside the candidate's answer, evidence-based assessment, improved answer, and targeted practice recommendations. Provide a role-aware overall score only when sufficient evidence exists. Never produce the same generic debrief for every candidate.

## PHASE 8 — Fix the whole application

Audit the entire journey from role selection and resume confirmation to interview setup, question delivery, follow-ups, session persistence, scoring, final review, and Recent Rounds.

Every phase must have a real learning objective and accurate completion state. Every button must perform its intended action. History must reflect real saved sessions. Refreshing or recovering from an interruption must not silently lose confirmed answers.

Keep the current working backend, authentication, database, and frontend architecture where possible. Centralize question selection, source metadata, prompt construction, evaluation, and persistence. Use validated structured outputs and real loading/error states.

Because this is a private local application, do not introduce unnecessary deployment services, paid dependencies, or complex infrastructure. Protect credentials and never retain raw audio/video at the application level.

## PHASE 9 — Verify before claiming completion

Test each major role and question category. Check source URLs and source attribution. Test repeated-question detection, role-specific coverage, resume grounding, adaptive follow-ups, and scoring with correct, partially correct, incorrect, vague, and technically valid alternative answers.

Verify that the final feedback changes according to the actual answer and resume. Test persistence, retries, refresh recovery, navigation, and the full interview flow.

Run existing backend tests, the frontend production build, and available integration/browser tests. Fix failures discovered during testing. Report unavailable tooling honestly.

Deliver the actual implementation, the verified source registry, the taxonomy, the changes to interview logic and feedback, and test results. Do not claim a feature works unless it was tested.

**Final standard:** no random questions, no fake source claims, no repetitive sessions, no generic resume interviews, and no superficial scoring. Every question must have a reason to be asked, a clear skill being assessed, and a useful way to evaluate the answer.
