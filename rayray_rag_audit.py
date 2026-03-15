#!/usr/bin/env python3
"""Ray Ray RAG auditing and tracing helpers.

This module is intentionally non-invasive: it wraps existing RAG functions and
persists debug artifacts when DEBUG_RAG is enabled.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Mapping, MutableMapping, Optional, Sequence

DEBUG_RAG = os.getenv("DEBUG_RAG", "false").lower() in {"1", "true", "yes", "on"}

LOG_DIR = Path("logs")
PROMPT_LOG = LOG_DIR / "rag_prompt.txt"
RESPONSE_LOG = LOG_DIR / "rag_response.txt"
RETRIEVAL_JSON_LOG = LOG_DIR / "retrieval_debug.json"

VALID_DOC_TYPES = {"glossary", "recipe", "error"}
VALID_ROUTES = {
    "glossary_responder",
    "recipe_responder",
    "error_responder",
    "fallback_responder",
}


@dataclass
class RetrievalChunk:
    document_id: str
    document_type: str
    operator_name: str
    similarity_score: float
    text_preview_first_120_chars: str


@dataclass
class FilteringDecision:
    document_id: str
    document_type: str
    reason_selected: str


@dataclass
class AuditTrace:
    timestamp: str = ""
    user_query: str = ""
    query_type_guess: str = "unknown"
    embedding_model_used: str = ""
    embedding_vector_length: int = 0
    embedding_generation_time_ms: int = 0
    retrieval_results: List[RetrievalChunk] = field(default_factory=list)
    selected_context: List[FilteringDecision] = field(default_factory=list)
    dropped_context: List[FilteringDecision] = field(default_factory=list)
    model_used: str = ""
    response_tokens: int = 0
    generation_time_ms: int = 0
    response_mode: str = "fallback_responder"


class RAGAudit:
    """Audit wrapper for a RAG pipeline."""

    def __init__(self, debug_rag: bool = DEBUG_RAG, log_dir: Path = LOG_DIR) -> None:
        self.debug_rag = debug_rag
        self.log_dir = log_dir
        self.trace = AuditTrace()
        if self.debug_rag:
            self.log_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def guess_query_type(user_query: str) -> str:
        q = user_query.lower()
        if any(k in q for k in ["what is", "define", "meaning", "operator", "top", "chop", "sop", "dat"]):
            return "operator_definition"
        if any(k in q for k in ["how do i", "how to", "steps", "workflow", "recipe", "stitch", "sequence", "build"]):
            return "workflow_recipe"
        if any(k in q for k in ["error", "crash", "not working", "fix", "issue", "troubleshoot", "bug", "fails"]):
            return "troubleshooting"
        return "unknown"

    def log_query(self, user_query: str) -> None:
        self.trace.timestamp = datetime.now(timezone.utc).isoformat()
        self.trace.user_query = user_query
        self.trace.query_type_guess = self.guess_query_type(user_query)

    def trace_embedding(self, embedding_model_used: str, embedding_vector: Sequence[float], generation_time_ms: int) -> None:
        self.trace.embedding_model_used = embedding_model_used
        self.trace.embedding_vector_length = len(embedding_vector)
        self.trace.embedding_generation_time_ms = int(generation_time_ms)

    def trace_retrieval(self, chunks: Iterable[Mapping[str, Any]]) -> None:
        top_chunks = list(chunks)[:10]
        results: List[RetrievalChunk] = []
        for chunk in top_chunks:
            doc_type = str(chunk.get("document_type", "unknown"))
            preview = str(chunk.get("text", ""))[:120]
            results.append(
                RetrievalChunk(
                    document_id=str(chunk.get("document_id", "unknown")),
                    document_type=doc_type if doc_type in VALID_DOC_TYPES else "unknown",
                    operator_name=str(chunk.get("operator_name", "")),
                    similarity_score=float(chunk.get("similarity_score", 0.0)),
                    text_preview_first_120_chars=preview,
                )
            )
        self.trace.retrieval_results = results

    def trace_filtering(self, selected: Iterable[Mapping[str, str]], dropped: Iterable[Mapping[str, str]]) -> None:
        self.trace.selected_context = [
            FilteringDecision(
                document_id=str(item.get("document_id", "unknown")),
                document_type=str(item.get("document_type", "unknown")),
                reason_selected=str(item.get("reason_selected", "selected")),
            )
            for item in selected
        ]
        self.trace.dropped_context = [
            FilteringDecision(
                document_id=str(item.get("document_id", "unknown")),
                document_type=str(item.get("document_type", "unknown")),
                reason_selected=str(item.get("reason_selected", "dropped")),
            )
            for item in dropped
        ]

    def trace_prompt_assembly(self, system_prompt: str, retrieved_context: str, user_query: str) -> None:
        if not self.debug_rag:
            return
        payload = (
            "=== SYSTEM PROMPT ===\n"
            f"{system_prompt}\n\n"
            "=== RETRIEVED CONTEXT ===\n"
            f"{retrieved_context}\n\n"
            "=== USER QUERY ===\n"
            f"{user_query}\n"
        )
        PROMPT_LOG.write_text(payload, encoding="utf-8")

    def trace_response(self, model_used: str, response_text: str, response_tokens: int, generation_time_ms: int) -> None:
        self.trace.model_used = model_used
        self.trace.response_tokens = int(response_tokens)
        self.trace.generation_time_ms = int(generation_time_ms)
        if self.debug_rag:
            RESPONSE_LOG.write_text(response_text, encoding="utf-8")

    def trace_routing(self, response_mode: str) -> None:
        self.trace.response_mode = response_mode if response_mode in VALID_ROUTES else "fallback_responder"

    def write_retrieval_visualization(self) -> None:
        if not self.debug_rag:
            return
        payload = {
            "query": self.trace.user_query,
            "retrieved_docs": [chunk.__dict__ for chunk in self.trace.retrieval_results],
            "selected_docs": [doc.__dict__ for doc in self.trace.selected_context],
        }
        RETRIEVAL_JSON_LOG.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def formatted_report(self) -> str:
        retrieval_lines = [
            f"{idx} {item.document_id} score {item.similarity_score:.2f}"
            for idx, item in enumerate(self.trace.retrieval_results, start=1)
        ] or ["(none)"]
        selected_lines = [item.document_id for item in self.trace.selected_context] or ["(none)"]

        retrieval_block = "\n".join(retrieval_lines)
        selected_block = "\n".join(selected_lines)

        return (
            f"QUERY TYPE: {self.trace.query_type_guess}\n\n"
            "RETRIEVAL RESULTS\n"
            f"{retrieval_block}\n\n"
            "SELECTED CONTEXT\n"
            f"{selected_block}\n\n"
            "ROUTED TO\n"
            f"{self.trace.response_mode}\n"
        )


def timed_call(fn: Callable[..., Any], *args: Any, **kwargs: Any) -> tuple[Any, int]:
    start = time.perf_counter()
    result = fn(*args, **kwargs)
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return result, elapsed_ms


def run_with_audit(
    user_query: str,
    embedding_model_name: str,
    embedding_fn: Callable[[str], Sequence[float]],
    retrieve_fn: Callable[[Sequence[float], int], Iterable[Mapping[str, Any]]],
    select_context_fn: Callable[[Iterable[Mapping[str, Any]]], tuple[Iterable[Mapping[str, str]], Iterable[Mapping[str, str]]]],
    build_prompt_fn: Callable[[Iterable[Mapping[str, str]], str], tuple[str, str]],
    generate_fn: Callable[[str], Mapping[str, Any]],
    route_fn: Callable[[str], str],
    debug_rag: bool = DEBUG_RAG,
) -> Dict[str, Any]:
    """Wrap an existing RAG pipeline without modifying business logic."""

    audit = RAGAudit(debug_rag=debug_rag)
    audit.log_query(user_query)

    embedding_vector, embed_ms = timed_call(embedding_fn, user_query)
    audit.trace_embedding(embedding_model_name, embedding_vector, embed_ms)

    retrieval_results, _ = timed_call(retrieve_fn, embedding_vector, 10)
    retrieval_results = list(retrieval_results)
    audit.trace_retrieval(retrieval_results)

    selected, dropped = select_context_fn(retrieval_results)
    selected = list(selected)
    dropped = list(dropped)
    audit.trace_filtering(selected, dropped)

    system_prompt, retrieved_context = build_prompt_fn(selected, user_query)
    audit.trace_prompt_assembly(system_prompt, retrieved_context, user_query)

    llm_payload, gen_ms = timed_call(generate_fn, retrieved_context)
    response_text = str(llm_payload.get("response_text", ""))
    response_tokens = int(llm_payload.get("response_tokens", 0))
    model_used = str(llm_payload.get("model_used", ""))
    audit.trace_response(model_used, response_text, response_tokens, gen_ms)

    response_mode = route_fn(response_text)
    audit.trace_routing(response_mode)
    audit.write_retrieval_visualization()

    return {
        "response_text": response_text,
        "response_mode": response_mode,
        "report": audit.formatted_report(),
        "trace": audit.trace,
    }


def _demo_runner(user_query: str, debug_rag: bool) -> str:
    """Deterministic local demo so developers can exercise the audit CLI."""

    def embedding_fn(query: str) -> Sequence[float]:
        return [float((ord(ch) % 13) / 13.0) for ch in query[:32]]

    def retrieve_fn(_vec: Sequence[float], limit: int) -> Iterable[Mapping[str, Any]]:
        sample = [
            {
                "document_id": "recipe_switch_top",
                "document_type": "recipe",
                "operator_name": "Switch TOP",
                "similarity_score": 0.81,
                "text": "Use a Switch TOP to sequence multiple clips and drive index selection over time.",
            },
            {
                "document_id": "glossary_multiply_top",
                "document_type": "glossary",
                "operator_name": "Multiply TOP",
                "similarity_score": 0.79,
                "text": "Multiply TOP combines pixel values from two textures by multiplication.",
            },
            {
                "document_id": "recipe_video_sequencing",
                "document_type": "recipe",
                "operator_name": "Composite",
                "similarity_score": 0.76,
                "text": "For stitching clips, chain Movie File In TOP nodes and sequence with Switch TOP or Cache TOP.",
            },
        ]
        return sample[:limit]

    def select_context_fn(docs: Iterable[Mapping[str, Any]]) -> tuple[Iterable[Mapping[str, str]], Iterable[Mapping[str, str]]]:
        selected: List[Dict[str, str]] = []
        dropped: List[Dict[str, str]] = []
        for doc in docs:
            if doc.get("document_type") == "recipe":
                selected.append(
                    {
                        "document_id": str(doc["document_id"]),
                        "document_type": str(doc["document_type"]),
                        "reason_selected": "matches workflow_recipe query type",
                    }
                )
            else:
                dropped.append(
                    {
                        "document_id": str(doc["document_id"]),
                        "document_type": str(doc.get("document_type", "unknown")),
                        "reason_selected": "lower rank and type mismatch",
                    }
                )
        return selected, dropped

    def build_prompt_fn(selected: Iterable[Mapping[str, str]], query: str) -> tuple[str, str]:
        context = "\n".join(item["document_id"] for item in selected)
        system = "You are Ray Ray, a TouchDesigner tutor. Use recipe context when available."
        return system, f"Context:\n{context}\n\nQuery:\n{query}"

    def generate_fn(prompt: str) -> Mapping[str, Any]:
        return {
            "model_used": "deepseek-chat",
            "response_tokens": 64,
            "response_text": f"Use Switch TOP to stitch clips. Prompt length={len(prompt)}",
        }

    def route_fn(_response_text: str) -> str:
        return "recipe_responder"

    result = run_with_audit(
        user_query=user_query,
        embedding_model_name="text-embedding-3-large",
        embedding_fn=embedding_fn,
        retrieve_fn=retrieve_fn,
        select_context_fn=select_context_fn,
        build_prompt_fn=build_prompt_fn,
        generate_fn=generate_fn,
        route_fn=route_fn,
        debug_rag=debug_rag,
    )
    return str(result["report"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Ray Ray RAG audit runner")
    parser.add_argument("query", help="User query to audit")
    parser.add_argument("--debug-rag", action="store_true", default=DEBUG_RAG, help="Enable debug file output")
    args = parser.parse_args()

    report = _demo_runner(args.query, debug_rag=args.debug_rag)
    print(report)


if __name__ == "__main__":
    main()
