from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class ContextCandidate:
    source: str
    target: str
    kind: str
    authority: str
    score: float
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class DisambiguationResult:
    source: str
    selected: ContextCandidate | None
    candidates: tuple[ContextCandidate, ...]
    confidence: float
    status: str
    reasons: tuple[str, ...]


class ContextualDisambiguator:
    """
    Generic, data-driven contextual resolver.

    Important:
    - No phrase -> Vietnamese translation mappings are embedded.
    - Phrase candidates come from the actual dictionary index.
    - A dictionary phrase may be realized in context with a small grammatical
      insertion (e.g. 了) between its characters. This is a generic Chinese
      phrase-matching rule, not a semantic hard-code.
    - Ambiguous cases remain REVIEW.
    """

    XIANXIA_HINTS = (
        "宗门", "宗", "境", "修士", "灵力", "真气", "神识",
        "妖兽", "法宝", "功法", "长老", "掌门", "渡劫",
        "筑基", "金丹", "元婴", "飞升"
    )

    # Common grammatical/function characters that may interrupt a lexical
    # phrase in surface text. This list is language-structural, not semantic.
    INSERTABLE_FUNCTION_CHARS = frozenset("了过着的地得")

    def __init__(self, resolver):
        self.resolver = resolver

    @staticmethod
    def _ctx(source, left="", right="", context=""):
        return "".join([left.strip(), source.strip(), right.strip(), context.strip()])

    @staticmethod
    def _score(base, bonuses):
        score = base.score
        reasons = list(getattr(base, "reasons", ()) or ())
        for delta, reason in bonuses:
            score += delta
            reasons.append(reason)
        return ContextCandidate(
            source=base.source,
            target=base.target,
            kind=base.kind,
            authority=base.authority,
            score=round(score, 4),
            reasons=tuple(reasons),
        )

    @staticmethod
    def _dedupe(items):
        seen=set()
        out=[]
        for c in items:
            key=(c.source,c.target,c.kind,c.authority)
            if key not in seen:
                seen.add(key)
                out.append(c)
        return out

    @staticmethod
    def _find_positions(text, focus):
        pos=0
        out=[]
        while True:
            i=text.find(focus,pos)
            if i<0:
                break
            out.append(i)
            pos=i+max(1,len(focus))
        return out

    @classmethod
    def _phrase_matches_context(cls, phrase, context):
        """
        Return match records for:
          1) contiguous phrase occurrences;
          2) phrase occurrences with one or more allowed function characters
             inserted between adjacent phrase characters.

        Example:
          中毒
          中了毒
        Both are recognized as the same dictionary lexical phrase.
        """
        matches=[]

        # Contiguous occurrence.
        start=0
        while True:
            idx=context.find(phrase,start)
            if idx<0:
                break
            matches.append((idx, len(phrase), 0, "contiguous phrase match"))
            start=idx+1

        # One inserted grammatical/function character between two phrase chars.
        if len(phrase)>=2:
            # Greedy left-to-right scan with at most one insertion per boundary.
            for start in range(len(context)):
                if context[start] != phrase[0]:
                    continue
                pos=start
                inserted=0
                ok=True
                for ch in phrase[1:]:
                    if pos+1 < len(context) and context[pos+1] == ch:
                        pos += 1
                        continue
                    if (
                        pos+2 < len(context)
                        and context[pos+1] in cls.INSERTABLE_FUNCTION_CHARS
                        and context[pos+2] == ch
                    ):
                        pos += 2
                        inserted += 1
                        continue
                    ok=False
                    break
                if ok:
                    matches.append((start, pos-start+1, inserted, "function-character insertion match"))

        # Deduplicate exact match records.
        return list(dict.fromkeys(matches))

    def _dictionary_phrase_entries(self, focus, context):
        entries=[]
        seen=set()

        for key in getattr(self.resolver,"cvdict",{}).keys():
            if len(key)<2 or len(key)>8:
                continue
            if focus not in key:
                continue
            if any(not ("\u3400" <= ch <= "\u9fff") for ch in key):
                continue

            matches=self._phrase_matches_context(key,context)
            if not matches:
                continue

            resolution=self.resolver.candidates_for(
                key,category="ordinary",context=context
            )

            for candidate in resolution.candidates:
                for start,span_len,inserted,match_kind in matches:
                    ident=(
                        key,candidate.target,candidate.kind,
                        candidate.authority,start,span_len,inserted
                    )
                    if ident in seen:
                        continue
                    seen.add(ident)

                    focus_offset=key.find(focus)
                    entries.append((
                        key,candidate,start,span_len,
                        focus_offset,inserted,match_kind
                    ))

        return entries

    def resolve(
        self,source,*,pinyin=None,category="ordinary",
        left="",right="",context=""
    ):
        source=source.strip()
        ctx=self._ctx(source,left,right,context)

        phrase_entries=self._dictionary_phrase_entries(source,ctx)
        ranked=[]

        for key,candidate,start,span_len,focus_offset,inserted,match_kind in phrase_entries:
            bonuses=[
                (2.50, f"dictionary phrase '{key}' matched context"),
                (-0.05*(len(key)-len(source)),
                 f"phrase complexity length={len(key)}"),
            ]

            if match_kind=="function-character insertion match":
                # A gapped lexical phrase is still strong evidence, but slightly
                # below a contiguous exact phrase.
                bonuses.append((-0.20, "lexical phrase recovered across grammatical insertion"))

            if focus_offset==0:
                bonuses.append((0.40, "focus occurs at phrase start"))

            ranked.append(self._score(candidate,bonuses))

        raw=self.resolver.candidates_for(
            source,pinyin=pinyin,category=category,context=ctx
        )
        for candidate in raw.candidates:
            bonuses=[]
            if candidate.authority=="mandatory":
                bonuses.append((2.0,"mandatory glossary authority"))
            if category=="soft_domain" and any(h in ctx for h in self.XIANXIA_HINTS):
                if candidate.kind=="domain_glossary":
                    bonuses.append((0.5,"xianxia domain context"))
            ranked.append(self._score(candidate,bonuses))

        ranked=self._dedupe(ranked)

        if not ranked:
            return DisambiguationResult(
                source,None,tuple(),0.0,"REVIEW",("no dictionary candidates",)
            )

        mandatory=[c for c in ranked if c.authority=="mandatory"]
        if mandatory:
            selected=max(mandatory,key=lambda c:c.score)
            return DisambiguationResult(
                source,selected,
                tuple(sorted(ranked,key=lambda c:c.score,reverse=True)),
                1.0,"PASS",
                selected.reasons+("mandatory authority selected",)
            )

        phrase_candidates=[c for c in ranked if c.kind=="cvdict_phrase" and c.source!=source]
        if phrase_candidates:
            # Prefer the shortest real dictionary phrase that matched the
            # context. This separates lexical phrase from broader context.
            shortest_len=min(len(c.source) for c in phrase_candidates)
            shortest=[c for c in phrase_candidates if len(c.source)==shortest_len]
            shortest.sort(key=lambda c:c.score,reverse=True)

            top=shortest[0]
            second=shortest[1] if len(shortest)>1 else None

            if second is None or top.score-second.score>=0.10:
                return DisambiguationResult(
                    source,top,
                    tuple(sorted(ranked,key=lambda c:c.score,reverse=True)),
                    0.96,"PASS",
                    top.reasons+(
                        f"dictionary phrase selected: {top.source}",
                    )
                )

            return DisambiguationResult(
                source,None,
                tuple(sorted(ranked,key=lambda c:c.score,reverse=True)),
                0.40,"REVIEW",
                ("multiple equally plausible dictionary phrases contain the focus",)
            )

        ranked.sort(key=lambda c:c.score,reverse=True)
        top=ranked[0]
        second=ranked[1] if len(ranked)>1 else None

        if second is None:
            return DisambiguationResult(
                source,top,tuple(ranked),0.80,"PASS",
                top.reasons+("single candidate",)
            )

        margin=top.score-second.score
        if margin>=1.0:
            return DisambiguationResult(
                source,top,tuple(ranked),
                min(0.99,0.60+margin/5.0),
                "PASS",
                top.reasons+(f"context margin={margin:.2f}",)
            )

        return DisambiguationResult(
            source,None,tuple(ranked),0.40,"REVIEW",
            ("context did not separate candidates strongly enough",)
        )
