from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Iterable

@dataclass(frozen=True)
class SemanticConstraint:
    source_span: str
    kind: str
    expected_targets: tuple[str, ...] = ()
    forbidden_targets: tuple[str, ...] = ()
    severity: str = "ERROR"
    authority: str = "contextual"
    reason: str = ""

@dataclass(frozen=True)
class SemanticEvidence:
    constraints: tuple[SemanticConstraint, ...] = ()

def _normalize(text: str) -> str:
    text = str(text or "").strip().lower()
    return re.sub(r"\s+", " ", text)

def _contains_phrase(target: str, phrase: str) -> bool:
    a, b = _normalize(target), _normalize(phrase)
    return bool(b) and b in a

class SemanticEvidenceEvaluator:
    ENFORCED_AUTHORITIES = {"mandatory", "series"}
    ENFORCED_CATEGORIES = set()

    @classmethod
    def from_registry(cls, registry: Iterable[dict] | None, *, semantic_resource: dict | None = None) -> SemanticEvidence:
        constraints = []
        for item in registry or ():
            if not isinstance(item, dict):
                continue
            source = str(item.get("source", "")).strip()
            target = str(item.get("target", "")).strip()
            authority = str(item.get("authority", "")).strip()
            if source and target and authority in cls.ENFORCED_AUTHORITIES:
                constraints.append(SemanticConstraint(
                    source_span=source,
                    kind="identity",
                    expected_targets=(target,),
                    severity="ERROR",
                    authority=authority,
                    reason="mandatory/series terminology authority",
                ))

        data = semantic_resource or {}
        concepts = data.get("concepts", {}) if isinstance(data, dict) else {}
        if isinstance(concepts, dict):
            for concept_id, spec in concepts.items():
                if not isinstance(spec, dict):
                    continue
                source_spans = tuple(str(x).strip() for x in spec.get("source_spans", []) if str(x).strip())
                expected = tuple(str(x).strip() for x in spec.get("target_evidence", []) if str(x).strip())
                conflicts = tuple(str(x).strip() for x in spec.get("conflicts", []) if str(x).strip())
                if not source_spans or not conflicts:
                    continue
                for source_span in source_spans:
                    constraints.append(SemanticConstraint(
                        source_span=source_span,
                        kind="semantic_concept",
                        expected_targets=expected,
                        forbidden_targets=conflicts,
                        severity="ERROR",
                        authority="resource",
                        reason=f"source semantic concept={concept_id}",
                    ))
        return SemanticEvidence(tuple(constraints))

    @classmethod
    def evaluate(cls, source: str, target: str, evidence: SemanticEvidence | None):
        findings = []
        if evidence is None:
            return findings
        for c in evidence.constraints:
            if not c.source_span or c.source_span not in source:
                continue
            if c.kind == "identity":
                if not any(_contains_phrase(target, t) for t in c.expected_targets):
                    findings.append({
                        "kind": "semantic_identity_mismatch",
                        "severity": c.severity,
                        "source_span": c.source_span,
                        "message": f"strong source-grounded unit '{c.source_span}' lost its required realization; expected one of {c.expected_targets}",
                        "reason": c.reason,
                    })
            elif c.kind == "semantic_concept":
                matched = [p for p in c.forbidden_targets if _contains_phrase(target, p)]
                if matched:
                    findings.append({
                        "kind": "semantic_concept_conflict",
                        "severity": c.severity,
                        "source_span": c.source_span,
                        "message": f"source semantic evidence for '{c.source_span}' conflicts with target concept {matched}; compatible evidence includes {c.expected_targets}",
                        "reason": c.reason,
                    })
            elif c.kind == "forbidden_target":
                matched = [p for p in c.forbidden_targets if _contains_phrase(target, p)]
                if matched:
                    findings.append({
                        "kind": "semantic_forbidden_target",
                        "severity": c.severity,
                        "source_span": c.source_span,
                        "message": f"source-grounded semantic constraint for '{c.source_span}' conflicts with target realization {matched}",
                        "reason": c.reason,
                    })
            elif c.kind == "expected_target":
                if c.expected_targets and not any(_contains_phrase(target, p) for p in c.expected_targets):
                    findings.append({
                        "kind": "semantic_expected_target_missing",
                        "severity": c.severity,
                        "source_span": c.source_span,
                        "message": f"semantic evidence for '{c.source_span}' requires a compatible target realization",
                        "reason": c.reason,
                    })
        return findings
