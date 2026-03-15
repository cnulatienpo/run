# Ray Ray RAG Audit

`rayray_rag_audit.py` adds optional tracing around a RAG pipeline without changing core logic.

## Enable audit mode

Audit output files are written only when debug mode is enabled.

- Environment variable: `DEBUG_RAG=true`
- CLI flag: `--debug-rag`

## Single command debug runner

```bash
python rayray_rag_audit.py "how do i stitch clips together" --debug-rag
```

This prints a formatted report to stdout and writes debug artifacts under `logs/` (or a custom `log_dir` when provided to `RAGAudit`).

## Generated logs

- `logs/rag_prompt.txt`
  - Prompt assembly trace with:
    - system prompt
    - retrieved context
    - **the exact full prompt sent to the model**
- `logs/rag_response.txt`
  - Full model response text
- `logs/retrieval_debug.json`
  - Retrieval + selection structure for visualization:

```json
{
  "query": "...",
  "retrieved_docs": [...],
  "selected_docs": [...],
  "dropped_docs": [...],
  "response_mode": "recipe_responder",
  "query_type_guess": "workflow_recipe"
}
```

## How to integrate with the existing backend

Use `run_with_audit(...)` and pass your existing functions:

- embed function
- retrieval function
- context selection/filtering function
- prompt assembly function
- model generation function
- routing function (invoked before generation using query + query type + selected context)

This keeps existing behavior as close as possible while adding traces and improving audit accuracy.

## Trace stages captured

1. Query logging
   - timestamp
   - user_query
   - query_type_guess (`operator_definition`, `workflow_recipe`, `troubleshooting`, `unknown`)
2. Embedding trace
   - embedding model name
   - vector length
   - generation time
3. Retrieval trace
   - top 10 chunks with IDs, doc type, operator, score, preview
4. Chunk filtering trace
   - selected docs + reason
   - dropped docs + reason
5. Routing trace (pre-generation)
   - responder mode chosen from query + query type + selected context
6. Prompt assembly trace
   - logs the exact full prompt sent to generation
7. Response trace
   - model used
   - response token count
   - generation time
   - full response written to file
8. Retrieval visualization trace
   - retrieved + selected + dropped docs and route metadata in JSON

## Common failure signatures

- **Wrong doc type dominates retrieval**
  - Symptom: glossary docs outrank recipe docs for a workflow query.
  - Check: `retrieval_debug.json` + stdout retrieval table.
- **Selection drops good context**
  - Symptom: correct recipe appears in retrieval but not in selected context.
  - Check: `selected_docs` vs dropped docs and `reason_selected` fields.
- **Prompt assembly drift**
  - Symptom: retrieved docs are good but model answer is off-topic.
  - Check: `rag_prompt.txt` for missing/garbled context.
- **Routing mismatch**
  - Symptom: answer style indicates glossary path while query is workflow.
  - Check: `response_mode` in report.
- **Latency spikes**
  - Symptom: slow responses.
  - Check: embedding/generation time in trace output.
