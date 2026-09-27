from __future__ import annotations

from dataclasses import dataclass, field, asdict
import re


@dataclass(frozen=True)
class SentenceContext:
    text: str
    index: int


@dataclass(frozen=True)
class LexicalDecision:
    span: str
    target: str | None
    source_kind: str | None
    authority: str | None
    confidence: float
    status: str
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class TokenContext:
    index: int
    text: str
    pos: str | None
    ner: str | None


@dataclass(frozen=True)
class DependencyContext:
    dependent: int
    head: int
    relation: str


@dataclass(frozen=True)
class MeaningFrame:
    source_text: str
    sentence_index: int
    previous: tuple[SentenceContext, ...]
    current: SentenceContext
    following: tuple[SentenceContext, ...]
    domain: str
    lexical_decisions: tuple[LexicalDecision, ...]
    entities: tuple[str, ...]
    locked_terms: tuple[str, ...]
    tokens: tuple[TokenContext, ...] = ()
    dependencies: tuple[DependencyContext, ...] = ()
    constituency: str | None = None
    notes: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict:
        return asdict(self)


class MeaningFrameBuilder:
    """
    Context/state container aligned with the reference zh2vi architecture.

    Reference architecture:
      CON -> phrase/fixed-expression matching
      NER -> atomic entity protection
      DEP -> contextual lexical selection via DRT
      POS -> lexical fallback
      Hán-Việt -> final OOV/fallback

    Critical rule:
      MeaningFrame does NOT invent lexical segmentation when CWS/POS/CON/NER/
      DEP analysis is absent. In no-analysis smoke mode it only records
      glossary/locked terms and sentence context. Real lexical selection is
      expected to happen once the local analyzer supplies linguistic structure.

    This prevents the previous failure mode where arbitrary CVDICT substrings
    such as 青云 inside 青云宗 or 中的 inside 他中的毒 were emitted as lexical
    decisions simply because the strings happened to occur in the sentence.
    """

    SENTENCE_SPLIT_RE = re.compile(r"(?<=[。！？!?；;])")

    def __init__(self, resolver, disambiguator):
        self.resolver = resolver
        self.disambiguator = disambiguator

    @classmethod
    def split_sentences(cls, text: str) -> list[str]:
        text=text.strip()
        if not text:
            return []
        pieces=[p.strip() for p in cls.SENTENCE_SPLIT_RE.split(text) if p.strip()]
        return pieces or [text]

    @staticmethod
    def _domain_signal(text: str) -> str:
        xianxia=("宗门","修士","灵力","真气","神识","妖兽","法宝","功法","筑基","金丹","元婴","渡劫","飞升","境")
        palace=("陛下","娘娘","本宫","臣妾","殿下","王爷","郡主","丞相","太后","嫔妃","皇后","贵妃")
        x=sum(1 for t in xianxia if t in text)
        p=sum(1 for t in palace if t in text)
        if x>p and x: return "xianxia"
        if p>x and p: return "court_drama"
        if x==p==0: return "unknown"
        return "mixed"

    def _glossary_state(self, context_text):
        entities=[]
        locked=[]
        glossary=getattr(self.resolver,"glossary",{})
        for span,(_,_,authority) in glossary.items():
            if span in context_text:
                entities.append(span)
                if authority in {"mandatory","series"}:
                    locked.append(span)
        return tuple(sorted(set(entities))),tuple(sorted(set(locked)))

    def _analysis_tokens(self,cws,pos,ner):
        cws=cws or []
        pos=pos or []
        ner=ner or []
        return tuple(
            TokenContext(
                index=i,
                text=token,
                pos=pos[i] if i<len(pos) else None,
                ner=ner[i] if i<len(ner) else None,
            )
            for i,token in enumerate(cws)
        )

    @staticmethod
    def _analysis_deps(dep):
        if not dep:
            return ()
        out=[]
        for item in dep:
            if isinstance(item,dict):
                out.append(DependencyContext(
                    int(item["dependent"]),
                    int(item["head"]),
                    str(item["relation"])
                ))
            else:
                dependent,head,relation=item
                out.append(DependencyContext(int(dependent),int(head),str(relation)))
        return tuple(out)

    def _phrase_decisions_from_constituency(self, sentence, con):
        """
        CON-backed phrase matching. The real repo gives CON precedence for
        whole-phrase/fixed-expression matching. We only accept a phrase when
        both the source span and a real dictionary candidate are present.
        """
        if not con:
            return []

        out=[]
        keys=getattr(self.resolver,"cvdict",{}).keys()
        for key in keys:
            if len(key)<2 or len(key)>8:
                continue
            if key not in sentence or key not in con:
                continue

            result=self.disambiguator.resolve(
                key,
                category="ordinary",
                context=sentence,
            )
            if result.selected and result.selected.source==key:
                out.append(
                    LexicalDecision(
                        span=key,
                        target=result.selected.target,
                        source_kind=result.selected.kind,
                        authority=result.selected.authority,
                        confidence=result.confidence,
                        status=result.status,
                        reasons=("CON phrase evidence",)+result.reasons,
                    )
                )

        # Longest exact phrase first; suppress strict substrings.
        out.sort(key=lambda d:(-len(d.span),sentence.find(d.span),d.span))
        kept=[]
        for decision in out:
            if any(decision.span!=k.span and decision.span in k.span for k in kept):
                continue
            kept.append(decision)
        return kept

    def _glossary_decisions_without_analysis(self,sentence):
        """
        Safe smoke fallback: only terms with explicit local authority are
        surfaced without linguistic segmentation.
        """
        decisions=[]
        glossary=getattr(self.resolver,"glossary",{})
        for span,(target,category,authority) in glossary.items():
            if span not in sentence:
                continue
            decisions.append(
                LexicalDecision(
                    span=span,
                    target=target,
                    source_kind="domain_glossary",
                    authority="mandatory" if authority in {"mandatory","series"} else "lexical",
                    confidence=1.0 if authority in {"mandatory","series"} else 0.9,
                    status="PASS",
                    reasons=("explicit glossary evidence; linguistic analyzer not supplied",),
                )
            )
        return decisions

    def build(
        self,
        text: str,
        sentence_index: int = 0,
        context_radius: int = 2,
        *,
        con: str | None = None,
        cws: list[str] | None = None,
        pos: list[str] | None = None,
        ner: list[str] | None = None,
        dep=None,
    ) -> MeaningFrame:
        sentences=self.split_sentences(text)
        if not sentences:
            raise ValueError("source text is empty")
        if sentence_index<0 or sentence_index>=len(sentences):
            raise IndexError("sentence_index out of range")

        start=max(0,sentence_index-context_radius)
        end=min(len(sentences),sentence_index+context_radius+1)

        previous=tuple(SentenceContext(sentences[i],i) for i in range(start,sentence_index))
        current=SentenceContext(sentences[sentence_index],sentence_index)
        following=tuple(SentenceContext(sentences[i],i) for i in range(sentence_index+1,end))

        context_text="".join(
            [x.text for x in previous]+[current.text]+[x.text for x in following]
        )

        tokens=self._analysis_tokens(cws,pos,ner)
        dependencies=self._analysis_deps(dep)

        if con:
            lexical=self._phrase_decisions_from_constituency(current.text,con)
            source_note="CON analyzer supplied; phrase matching enabled"
        elif cws is not None or pos is not None or ner is not None or dep is not None:
            # Analyzer data exists but no constituency tree. Do not invent a
            # lexical segmentation from raw dictionary substrings.
            lexical=[]
            source_note="partial linguistic analysis supplied; lexical segmentation deferred"
        else:
            lexical=self._glossary_decisions_without_analysis(current.text)
            source_note="no linguistic analyzer supplied; only explicit glossary terms surfaced"

        entities,locked=self._glossary_state(context_text)
        domain=self._domain_signal(context_text)

        notes=(
            f"context_radius={context_radius}",
            f"sentence_count={len(sentences)}",
            source_note,
            "source text was not rewritten",
        )

        return MeaningFrame(
            source_text=text,
            sentence_index=sentence_index,
            previous=previous,
            current=current,
            following=following,
            domain=domain,
            lexical_decisions=tuple(lexical),
            entities=entities,
            locked_terms=locked,
            tokens=tokens,
            dependencies=dependencies,
            constituency=con,
            notes=notes,
        )
