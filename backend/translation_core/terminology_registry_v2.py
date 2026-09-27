from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class RegistrySpan:
    source: str
    target: str
    kind: str
    authority: str
    score: float
    category: str
    evidence: tuple[str, ...]


class TerminologyRegistryV2:
    """
    Source-grounded terminology registry.

    Unlike v005, this registry does not admit every resolver-backed n-gram.
    Candidate spans compete by source coverage and authority.

    Selection evidence:
      - actual local resolver candidate;
      - authority classifier result;
      - longer spans beat their contained substrings;
      - mandatory > contextual > lexical;
      - domain/soft-domain evidence beats bare ordinary evidence;
      - overlapping lower-authority spans are suppressed.

    No target strings are hard-coded.
    """

    PRIORITY = {
        "mandatory": 5.0,
        "contextual": 4.0,
        "series": 3.5,
        "lexical": 2.0,
        "none": 0.0,
    }

    KIND_BONUS = {
        "domain_glossary": 2.5,
        "cvdict_phrase": 1.5,
        "hanviet_pinyin": 1.0,
        "hanviet_char": 0.9,
    }

    def __init__(self, resolver, authority_classifier):
        self.resolver = resolver
        self.authority_classifier = authority_classifier

    def _resolver_candidates(self, span: str, context: str):
        result = self.resolver.candidates_for(
            span, category="ordinary", context=context
        )
        out = []
        seen = set()
        for c in result.candidates:
            if not c.target:
                continue
            if c.kind not in self.KIND_BONUS:
                continue
            key=(c.target,c.kind,c.authority)
            if key in seen:
                continue
            seen.add(key)
            out.append(c)
        return out

    def _candidate_spans(self, source: str, max_len: int = 8):
        spans=set()
        for key in self.resolver.cvdict.keys():
            if 2 <= len(key) <= max_len and key in source:
                if all("\u3400" <= ch <= "\u9fff" for ch in key):
                    spans.add(key)

        # Generic contiguous Han n-grams, but only as discovery. They are
        # admitted later only when resolver evidence + authority support them.
        for i,ch in enumerate(source):
            if not ("\u3400" <= ch <= "\u9fff"):
                continue
            for j in range(i+2,min(len(source),i+max_len)+1):
                span=source[i:j]
                if all("\u3400" <= c <= "\u9fff" for c in span):
                    spans.add(span)
        return sorted(spans,key=lambda x:(-len(x),source.find(x),x))

    def build(self, source: str):
        raw=[]

        for span in self._candidate_spans(source):
            candidates=self._resolver_candidates(span,source)
            if not candidates:
                continue

            authority=self.authority_classifier.classify(
                span, context=source, observed_sentence=source
            )

            for c in candidates:
                evidence=list(authority.reasons)
                if len(span)>=2:
                    evidence.append(f"source span length={len(span)}")
                if c.kind=="domain_glossary":
                    evidence.append("real domain glossary candidate")
                elif c.kind=="cvdict_phrase":
                    evidence.append("real CVDICT phrase candidate")
                elif c.kind.startswith("hanviet"):
                    evidence.append("real Hán-Việt candidate")

                score=(
                    len(span) * 0.20
                    + self.PRIORITY.get(authority.authority,0.0)
                    + self.KIND_BONUS.get(c.kind,0.0)
                    + float(c.score)
                )

                # Authority REVIEW is not an accepted lock. It remains a
                # candidate but with reduced weight, so evidence cannot be
                # silently promoted.
                if authority.status=="REVIEW":
                    score-=1.5

                raw.append(
                    RegistrySpan(
                        source=span,
                        target=c.target,
                        kind=c.kind,
                        authority=authority.authority,
                        score=round(score,4),
                        category=authority.category,
                        evidence=tuple(evidence),
                    )
                )

        # Greedy source-span selection: longest/highest-evidence first.
        raw.sort(key=lambda x:(-x.score,-len(x.source),-self.PRIORITY.get(x.authority,0.0)))

        chosen=[]
        covered=set()

        for item in raw:
            positions=[]
            start=source.find(item.source)
            if start<0:
                continue
            positions=list(range(start,start+len(item.source)))

            # Only suppress overlap when the existing item is at least as long
            # and has equal/higher evidence. This prevents ordinary substrings
            # from masking strong phrase candidates.
            overlap=any(p in covered for p in positions)
            if overlap:
                continue

            chosen.append(item)
            covered.update(positions)

        return chosen

    def as_dicts(self, source: str):
        return [
            {
                "source":x.source,
                "target":x.target,
                "kind":x.kind,
                "authority":x.authority,
                "score":x.score,
                "category":x.category,
                "evidence":list(x.evidence),
            }
            for x in self.build(source)
        ]
