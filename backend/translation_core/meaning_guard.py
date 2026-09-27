from __future__ import annotations

from dataclasses import dataclass
import re

from semantic_evidence import SemanticEvidence, SemanticEvidenceEvaluator


@dataclass(frozen=True)
class GuardFinding:
    line_no: int
    kind: str
    severity: str
    source: str
    target: str
    message: str


@dataclass(frozen=True)
class GuardResult:
    line_no: int
    source: str
    target: str
    status: str
    findings: tuple[GuardFinding, ...]


class MeaningGuard:
    """
    v009: repetition is evaluated against source-side evidence.

    A repeated Vietnamese lexical word is not automatically an error.

    It is explained when at least one of the following is true:
      1. it occurs inside a selected terminology target phrase;
      2. two distinct selected source spans share a Chinese character that
         plausibly maps to the repeated Vietnamese lexical unit;
      3. the repeated word is a normal target realization of a selected source
         terminology unit and the source contains that semantic component
         multiple times.

    This is generic evidence extraction, not a Vietnamese whitelist.
    """

    STOP_WORDS={
        "và","là","của","có","đã","đang","sẽ","một","những","các","cho",
        "trong","trên","dưới","ở","với","này","đó","kia","thì","mà","được",
        "không","chỉ","rất","lại","ra","vào","từ","theo","đến","khi","nếu",
        "bị","cũng","như","nên","để","vẫn","còn","mỗi","đều","chưa",
    }

    @staticmethod
    def _is_title_word(word):
        return bool(word) and word[0].isupper() and word[1:].islower()

    @classmethod
    def _word_keys(cls,target):
        """
        Return case-normalized tokens while separating words that belong to a
        multi-word proper name. This keeps a sentence-initial lexical word such
        as ``Thanh`` distinct from the same spelling inside ``Thanh Vân``.
        """
        words=re.findall(r"[A-Za-zÀ-ỹĐđ]+",target)
        proper_indexes=set()
        for i in range(len(words)-1):
            if cls._is_title_word(words[i]) and cls._is_title_word(words[i+1]):
                proper_indexes.update((i,i+1))
        return words,[(word.lower(),i in proper_indexes) for i,word in enumerate(words)]

    @classmethod
    def _repeat_candidates(cls,target):
        """
        Flag only strong repetition evidence:
          * the same lexical word occurs at least three times; or
          * the same two-to-five-word phrase is repeated immediately.

        Two separated occurrences are intentionally not findings.
        """
        words,keys=cls._word_keys(target)
        counts={}
        for i,(normalized,is_proper) in enumerate(keys):
            if len(normalized)<4 or normalized in cls.STOP_WORDS:
                continue
            counts.setdefault((normalized,is_proper),[]).append(i)

        findings=[]
        seen=set()
        for (normalized,_is_proper),indexes in counts.items():
            if len(indexes)>=3:
                marker=("word",normalized)
                if marker not in seen:
                    seen.add(marker)
                    findings.append((normalized,"repeated_word"))

        max_phrase=min(5,len(keys)//2)
        # A single word appearing twice is not a repeated *phrase*. Starting
        # at two words avoids false REVIEW results for natural constructions
        # such as "sao ... sao", "ta ... ta", and duplicated proper names.
        for size in range(2,max_phrase+1):
            for start in range(0,len(keys)-(size*2)+1):
                first=keys[start:start+size]
                second=keys[start+size:start+(size*2)]
                if first!=second:
                    continue
                phrase=" ".join(words[start:start+size]).lower()
                if not any(len(word)>=2 for word in phrase.split()):
                    continue
                marker=("phrase",phrase)
                if marker in seen:
                    continue
                seen.add(marker)
                findings.append((phrase,"adjacent_phrase"))

        # A longer content phrase occurring twice with other words between it
        # is suspicious too. This catches duplicated semantic tails even when
        # an upstream terminology span was segmented incorrectly.
        repeated_phrases=[]
        for size in range(min(6,len(keys)//2),2,-1):
            for start in range(0,len(keys)-size+1):
                first=keys[start:start+size]
                phrase_words=words[start:start+size]
                normalized_words=[item[0] for item in first]
                if sum(1 for word in normalized_words if word not in cls.STOP_WORDS and len(word)>=3)<2:
                    continue
                for second_start in range(start+size,len(keys)-size+1):
                    if first!=keys[second_start:second_start+size]:
                        continue
                    phrase=" ".join(phrase_words).lower()
                    if any(phrase in existing for existing in repeated_phrases):
                        break
                    marker=("phrase_anywhere",phrase)
                    if marker not in seen:
                        seen.add(marker)
                        repeated_phrases.append(phrase)
                        findings.append((phrase,"repeated_phrase"))
                    break
        return findings

    @staticmethod
    def _contains_phrase(target,phrase):
        return phrase.strip().lower() in target.lower()

    @staticmethod
    def _han_chars(text):
        return {c for c in text if "\u3400" <= c <= "\u9fff"}

    @classmethod
    def _selected_items(cls,registry):
        return [x for x in (registry or []) if isinstance(x,dict)]

    @classmethod
    def _target_phrase_explains(cls,repeated,target,registry):
        target_l=target.lower()
        for item in cls._selected_items(registry):
            phrase=str(item.get("target","")).strip().lower()
            if len(phrase.split())<2:
                continue
            words=set(re.findall(r"[A-Za-zÀ-ỹĐđ]+",phrase))
            if repeated in words and phrase in target_l:
                return True
        return False

    @classmethod
    def _source_morpheme_explains(cls,repeated,target,source,registry):
        """
        Generic source-side explanation.

        When two non-overlapping selected source spans share a Chinese
        character, repeated target morphology can be a faithful realization
        (e.g. different compounds sharing the same Han character).

        We do not map a specific Chinese character to a hard-coded Vietnamese
        word. We only suppress a repetition when BOTH:
          - the repeated target word occurs in target realizations associated
            with at least two selected spans, and
          - those source spans share at least one Han character.
        """
        hits=[]
        for item in cls._selected_items(registry):
            phrase=str(item.get("target","")).strip().lower()
            if not phrase:
                continue
            words=set(re.findall(r"[A-Za-zÀ-ỹĐđ]+",phrase))
            if repeated in words and phrase in target.lower():
                hits.append(item)

        if len(hits)<2:
            return False

        for i,a in enumerate(hits):
            for b in hits[i+1:]:
                sa=str(a.get("source",""))
                sb=str(b.get("source",""))
                if not sa or not sb:
                    continue
                if cls._han_chars(sa) & cls._han_chars(sb):
                    return True
        return False

    @classmethod
    def _realization_flags(cls,source,target,registry):
        findings=[]
        for item in cls._selected_items(registry):
            source_span=str(item.get("source",""))
            phrase=str(item.get("target","")).strip()
            if not source_span or not phrase:
                continue

            phrase_words=re.findall(r"[A-Za-zÀ-ỹĐđ]+",phrase)
            category=item.get("category")
            if category not in {"proper_name","named_artifact"} and len(phrase_words)<2:
                continue

            if source.count(source_span)!=1:
                continue

            target_count=target.lower().count(phrase.lower())
            if target_count>1:
                kind = "entity_realization_duplication" if category in {"proper_name","named_artifact"} else "term_realization_duplication"
                findings.append(
                    (
                        kind,
                        f"source unit '{source_span}' occurs once but target unit "
                        f"'{phrase}' occurs {target_count} times",
                    )
                )
        return findings

    @classmethod
    def _terminology_plan_flags(cls,target,terminology_plan):
        findings=[]
        target_l=target.lower()
        for item in terminology_plan or ():
            if not isinstance(item,dict):
                continue
            source=str(item.get("source","")).strip()
            status=str(item.get("status","")).upper()
            selected=item.get("selected") if isinstance(item.get("selected"),dict) else None
            if status=="REVIEW":
                # Ordinary CVDICT/Hán-Việt evidence without an authoritative
                # selected candidate is informational only. It must not turn
                # an otherwise clean segment into REVIEW.
                if not bool(item.get("reviewRequired")):
                    continue
                findings.append((
                    "terminology_plan_review",
                    "WARN",
                    f"terminology decision for '{source}' requires review",
                ))
                continue
            if not selected:
                continue
            expected=str(selected.get("target","")).strip()
            authority=str(selected.get("authority","")).strip()
            source_kind=str(selected.get("sourceKind","")).strip()
            if not expected or expected.lower() in target_l:
                continue
            if authority in {"mandatory","series"}:
                severity="ERROR"
            elif source_kind=="domain_glossary":
                severity="WARN"
            else:
                # CVDICT and ordinary Hán-Việt candidates influence N-best
                # ranking but remain evidence-only, never hard constraints.
                continue
            findings.append((
                "planned_term_missing",
                severity,
                f"selected terminology for '{source}' is missing; expected '{expected}'",
            ))
        return findings

    @classmethod
    def check(
        cls,
        *,
        line_no,
        source,
        target,
        locked_terms=None,
        terminology_registry=None,
        terminology_plan=None,
        domain=None,
        memory=None,
        semantic_evidence: SemanticEvidence | None = None,
    ):
        findings=[]

        if not target.strip():
            findings.append(GuardFinding(
                line_no,"empty_output","ERROR",source,target,"model output is empty"
            ))

        if re.search(r"[\u3400-\u9fff]",target):
            findings.append(GuardFinding(
                line_no,"cjk_residue","ERROR",source,target,
                "Chinese characters remain in Vietnamese output"
            ))

        for repeated,repeat_kind in cls._repeat_candidates(target):
            if cls._target_phrase_explains(repeated,target,terminology_registry):
                continue
            if cls._source_morpheme_explains(repeated,target,source,terminology_registry):
                continue
            repeat_label = (
                "adjacent phrase" if repeat_kind == "adjacent_phrase"
                else "repeated phrase" if repeat_kind == "repeated_phrase"
                else "lexical word repeated at least three times"
            )
            findings.append(GuardFinding(
                line_no,"repetition","WARN",source,target,
                f"suspicious {repeat_label}: {repeated}"
            ))

        for kind,msg in cls._realization_flags(source,target,terminology_registry):
            findings.append(GuardFinding(
                line_no,kind,"WARN",source,target,msg
            ))

        for kind,severity,msg in cls._terminology_plan_flags(target,terminology_plan):
            findings.append(GuardFinding(
                line_no,kind,severity,source,target,msg
            ))

        src_chars=len(re.sub(r"\s+","",source))
        tgt_chars=len(re.sub(r"\s+","",target))
        if src_chars>20 and tgt_chars<max(4,src_chars*0.20):
            findings.append(GuardFinding(
                line_no,"length_anomaly","WARN",source,target,
                "target is unusually short relative to source; semantic loss requires review"
            ))

        for src_term,expected in (locked_terms or {}).items():
            if expected not in target:
                findings.append(GuardFinding(
                    line_no,"locked_term_missing","ERROR",source,target,
                    f"required locked term missing: {src_term} -> {expected}"
                ))

        if memory:
            for src_term in (locked_terms or {}):
                if memory.has_negative_rule(source=src_term,context=source,domain=domain):
                    findings.append(GuardFinding(
                        line_no,"negative_memory_hit","ERROR",source,target,
                        f"user negative-rule memory matched: {src_term}"
                    ))

        # v010 semantic evidence layer. It consumes explicit upstream
        # evidence and never invents source-specific mappings.
        for item in SemanticEvidenceEvaluator.evaluate(source, target, semantic_evidence):
            findings.append(GuardFinding(
                line_no,
                item["kind"],
                item["severity"],
                source,
                target,
                item["message"],
            ))

        return GuardResult(
            line_no=line_no,
            source=source,
            target=target,
            status="REVIEW" if findings else "PASS",
            findings=tuple(findings),
        )
