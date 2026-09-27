from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TerminologyCandidate:
    source: str
    target: str
    source_kind: str
    authority: str
    score: float
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class TerminologyDecision:
    source: str
    selected: TerminologyCandidate | None
    status: str
    domain: str
    reasons: tuple[str, ...] = ()


class TerminologyPlanner:
    """
    Corpus-driven terminology/register planner.

    Domain classification is not a fixed sentence list. It uses an explicit
    local domain lexicon loaded from data/xianxia-domain-lexicon.json.

    Domain score:
      +3 strong term
      +1.5 medium term
      -1 negative ordinary-animal/object marker

    A single strong cultivation term is sufficient to mark the sentence as
    xianxia; several medium terms can also do so. Ambiguous ordinary sentences
    can remain unknown.

    Translation candidates still come only from DictionaryResolver.
    """

    def __init__(self, resolver, *, domain_terms=(), domain_lexicon=None):
        self.resolver = resolver
        self.domain_terms = set(domain_terms)
        self.domain_lexicon = domain_lexicon or {"strong": [], "medium": [], "negative": []}

    @classmethod
    def from_file(cls, resolver, path):
        data = __import__("json").loads(open(path, encoding="utf-8").read())
        terms = set(data.get("strong", [])) | set(data.get("medium", []))
        return cls(resolver, domain_terms=terms, domain_lexicon=data)

    def _domain(self, context: str):
        strong=[t for t in self.domain_lexicon.get("strong", []) if t and t in context]
        medium=[t for t in self.domain_lexicon.get("medium", []) if t and t in context]
        negative=[t for t in self.domain_lexicon.get("negative", []) if t and t in context]

        score = 3.0*len(strong) + 1.5*len(medium) - 1.0*len(negative)
        if score >= 3.0:
            return "xianxia", min(1.0, score/6.0)
        if score >= 1.5:
            return "xianxia", min(1.0, score/6.0)
        return "unknown", max(0.0, min(1.0, score/6.0))

    def _candidate_pool(self, source: str, context: str):
        result=self.resolver.candidates_for(source,category="ordinary",context=context)
        return list(result.candidates)

    def plan(self, source: str, *, context: str="", category: str="ordinary"):
        domain,domain_score=self._domain(context)
        pool=self._candidate_pool(source,context)

        if not pool:
            return TerminologyDecision(
                source,None,"REVIEW",domain,
                (f"no dictionary candidate; domain_score={domain_score:.2f}",)
            )

        mandatory=[c for c in pool if c.authority=="mandatory"]
        if mandatory:
            c=max(mandatory,key=lambda x:x.score)
            return TerminologyDecision(
                source,
                TerminologyCandidate(
                    c.source,c.target,c.kind,c.authority,
                    round(c.score+3.0,4),
                    ("mandatory glossary authority",),
                ),
                "PASS",domain,("locked terminology retained",)
            )

        domain_gloss=[c for c in pool if c.kind=="domain_glossary"]
        if domain_gloss and domain=="xianxia":
            c=max(domain_gloss,key=lambda x:x.score)
            return TerminologyDecision(
                source,
                TerminologyCandidate(
                    c.source,c.target,c.kind,c.authority,
                    round(c.score+2.0+domain_score,4),
                    ("domain=xianxia",),
                ),
                "PASS",domain,("domain glossary candidate selected",)
            )

        hv=[c for c in pool if c.kind.startswith("hanviet")]
        lexical=[c for c in pool if c.kind=="cvdict_phrase"]

        if domain=="xianxia" and hv and not lexical:
            c=max(hv,key=lambda x:x.score)
            return TerminologyDecision(
                source,
                TerminologyCandidate(
                    c.source,c.target,c.kind,c.authority,
                    round(c.score+domain_score,4),
                    ("xianxia domain context",),
                ),
                "PASS",domain,
                ("Hán-Việt candidate retained because no stronger lexical phrase exists",)
            )

        if lexical:
            c=max(lexical,key=lambda x:x.score)
            return TerminologyDecision(
                source,
                TerminologyCandidate(
                    c.source,c.target,c.kind,c.authority,c.score,
                    ("semantic lexical candidate",),
                ),
                "PASS",domain,
                ("ordinary semantic rendering allowed",)
            )

        if hv:
            return TerminologyDecision(
                source,None,"REVIEW",domain,
                ("Hán-Việt candidate exists but authority/context is insufficient to force it",)
            )

        return TerminologyDecision(
            source,None,"REVIEW",domain,
            ("candidate pool did not produce a usable terminology decision",)
        )
