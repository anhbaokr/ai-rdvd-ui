from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
import hashlib
import json
import re
from typing import Iterable


@dataclass(frozen=True)
class MemoryRecord:
    record_type: str
    source: str
    target: str | None
    domain: str | None
    context_key: str | None
    authority: str
    approved: bool
    confidence: float
    metadata: dict


class LearningMemory:
    """
    Explicit-feedback memory layer.

    It learns only from an explicit user approval/correction event.
    It never promotes a REVIEW or a model guess into a locked term.

    Record types:
      term
      context_rule
      entity
      artifact
      negative_rule
      correction

    Storage is append-only JSONL so the project can inspect history and rebuild
    a compact profile later.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.touch()

    @staticmethod
    def context_key(source: str, context: str) -> str:
        norm = re.sub(r"\s+", " ", context.strip().lower())
        return hashlib.sha256(f"{source}\n{norm}".encode("utf-8")).hexdigest()[:20]

    def _append(self, record: MemoryRecord):
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")

    def learn_correction(
        self,
        *,
        source: str,
        target: str,
        context: str,
        domain: str | None,
        category: str,
        approved: bool = True,
        confidence: float = 1.0,
        metadata: dict | None = None,
    ) -> MemoryRecord:
        if not approved:
            raise ValueError("Only explicit approved corrections can enter learning memory.")
        if not source.strip() or not target.strip():
            raise ValueError("source and target are required.")

        context_id = self.context_key(source, context)
        authority = "user_locked" if category in {"proper_name", "named_artifact", "soft_domain"} else "user_preferred"

        record = MemoryRecord(
            record_type="term",
            source=source.strip(),
            target=target.strip(),
            domain=domain,
            context_key=context_id,
            authority=authority,
            approved=True,
            confidence=float(confidence),
            metadata={
                "category": category,
                **(metadata or {}),
            },
        )
        self._append(record)

        correction = MemoryRecord(
            record_type="correction",
            source=source.strip(),
            target=target.strip(),
            domain=domain,
            context_key=context_id,
            authority=authority,
            approved=True,
            confidence=float(confidence),
            metadata={
                "category": category,
                **(metadata or {}),
            },
        )
        self._append(correction)
        return record

    def learn_negative_rule(
        self,
        *,
        source: str,
        context: str,
        domain: str | None,
        reason: str,
    ) -> MemoryRecord:
        context_id = self.context_key(source, context)
        record = MemoryRecord(
            record_type="negative_rule",
            source=source.strip(),
            target=None,
            domain=domain,
            context_key=context_id,
            authority="user_negative",
            approved=True,
            confidence=1.0,
            metadata={"reason": reason},
        )
        self._append(record)
        return record

    def _records(self) -> list[MemoryRecord]:
        if not self.path.exists():
            return []
        out = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            out.append(MemoryRecord(**json.loads(line)))
        return out

    def lookup(self, *, source: str, context: str, domain: str | None = None) -> list[MemoryRecord]:
        ctx = self.context_key(source, context)
        out = []
        for record in self._records():
            if not record.approved or record.source != source:
                continue
            if record.context_key == ctx:
                out.append(record)
                continue
            if record.domain and domain and record.domain == domain and record.record_type == "term":
                out.append(record)
        return out

    def has_negative_rule(self, *, source: str, context: str, domain: str | None = None) -> bool:
        ctx = self.context_key(source, context)
        for record in self._records():
            if record.record_type != "negative_rule" or not record.approved:
                continue
            if record.source != source:
                continue
            if record.context_key == ctx:
                return True
            if record.domain and domain and record.domain == domain:
                return True
        return False

    def compact_profile(self) -> dict:
        profile = {}
        for record in self._records():
            if record.record_type != "term" or not record.approved or not record.target:
                continue
            bucket = profile.setdefault(record.source, [])
            bucket.append({
                "target": record.target,
                "domain": record.domain,
                "authority": record.authority,
                "confidence": record.confidence,
                "context_key": record.context_key,
            })
        return profile

    def save_compact_profile(self, path: Path):
        Path(path).write_text(
            json.dumps(self.compact_profile(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
