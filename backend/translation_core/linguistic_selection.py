from __future__ import annotations

import json
from pathlib import Path
from dataclasses import dataclass


DRT_BIAS = {
    "RES": 1, "OBJ": 2, "AGT": 3, "PREP": 4,
    "ADV": 5, "NMOD": 6, "CLF": 7, "BEI": 8, "OTH": 9,
}

DEPREL_TO_DRT = {
    "nsubj":"AGT","top":"AGT","xsubj":"AGT","csubj":"AGT",
    "dobj":"OBJ","range":"OBJ","attr":"OBJ","ba":"OBJ","nsubjpass":"OBJ",
    "rcomp":"RES","ccomp":"RES","xcomp":"RES",
    "nn":"NMOD","amod":"NMOD","assmod":"NMOD","rcmod":"NMOD",
    "clf":"CLF","nummod":"CLF","ordmod":"CLF","det":"CLF",
    "advmod":"ADV","tmod":"ADV","dvpmod":"ADV","dvpm":"ADV","mmod":"ADV","neg":"ADV",
    "prep":"PREP","pobj":"PREP","lobj":"PREP","pccomp":"PREP","loc":"PREP","lccomp":"PREP","plmod":"PREP",
    "pass":"BEI",
}


@dataclass(frozen=True)
class DepMatch:
    child_val: str
    parent_val: str | None


@dataclass(frozen=True)
class LinguisticToken:
    index: int
    text: str
    pos: str
    ner: str | None = None


@dataclass(frozen=True)
class Dependency:
    head: int
    dependent: int
    relation: str


@dataclass(frozen=True)
class Selection:
    token: str
    target: str | None
    source_kind: str | None
    authority: str | None
    status: str
    confidence: float
    stage: str
    reasons: tuple[str, ...] = ()


class DepDict:
    """Python port of chi-vi/hanlp_mt/src/zh2vi/dict/dep_dict.cr."""

    def __init__(self):
        self._entries = []
        self._by_child = {}

    def add(self, child, parent, deprel, child_val, parent_val=None):
        entry = {
            "child": child,
            "parent": parent,
            "deprel": deprel,
            "child_val": child_val,
            "parent_val": parent_val,
            "parent_pattern": "*" in parent,
            "deprel_wildcard": deprel == "*",
        }
        self._entries.append(entry)
        self._by_child.setdefault(child, []).append(entry)

    @classmethod
    def load(cls, path):
        d = cls()
        path = Path(path)
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line:
                continue
            arr = json.loads(line)
            if len(arr) >= 5:
                d.add(arr[0], arr[1], arr[2], arr[3], arr[4])
        return d

    @staticmethod
    def _parent_matches(entry, text):
        p = entry["parent"]
        if not entry["parent_pattern"]:
            return p == text
        if p.startswith("*"):
            return text.endswith(p[1:])
        if p.endswith("*"):
            return text.startswith(p[:-1])
        return False

    def lookup(self, child, parent, rel):
        candidates = self._by_child.get(child, [])
        exact_exact = exact_wild = pattern_exact = pattern_wild = None

        for e in candidates:
            if not self._parent_matches(e, parent):
                continue
            if not (e["deprel_wildcard"] or e["deprel"] == rel):
                continue

            if not e["parent_pattern"] and not e["deprel_wildcard"]:
                exact_exact = e
            elif not e["parent_pattern"] and e["deprel_wildcard"]:
                exact_wild = e
            elif e["parent_pattern"] and not e["deprel_wildcard"]:
                pattern_exact = e
            else:
                pattern_wild = e

        e = exact_exact or exact_wild or pattern_exact or pattern_wild
        if not e:
            return None

        return DepMatch(
            e["child_val"],
            None if e["parent_pattern"] else e["parent_val"],
        )

    @property
    def size(self):
        return len(self._entries)


class LinguisticSelectionEngine:
    """
    Real DEP/POS/Hán-Việt selection boundary.

    DEP stage only fires when the actual DepDict returns a match.
    A DRT label by itself is never treated as a translation.
    """

    def __init__(self, resolver, dep_dict):
        self.resolver = resolver
        self.dep_dict = dep_dict

    @staticmethod
    def drt(relation):
        return DEPREL_TO_DRT.get(relation, "OTH")

    def _dep_lookup(self, token, deps, cws):
        idx = token.index + 1
        as_head = [r for r in deps if r.head == idx]
        as_dep = [r for r in deps if r.dependent == idx]
        matches = []

        for rel in as_head:
            drt = self.drt(rel.relation)

            if drt == "CLF":
                j = rel.dependent - 1
                if 0 <= j < len(cws):
                    m = (
                        self.dep_dict.lookup(token.text, cws[j], "CLF")
                        or self.dep_dict.lookup(token.text, cws[j], rel.relation)
                    )
                    if m:
                        matches.append((DRT_BIAS["CLF"], m, rel.relation, cws[j]))

            elif drt == "OBJ":
                j = rel.dependent - 1
                if 0 <= j < len(cws):
                    m = (
                        self.dep_dict.lookup(token.text, cws[j], rel.relation)
                        or self.dep_dict.lookup(token.text, cws[j], "OBJ")
                    )
                    if m:
                        matches.append((DRT_BIAS["OBJ"], m, rel.relation, cws[j]))

            elif drt == "AGT":
                j = rel.dependent - 1
                if 0 <= j < len(cws):
                    m = (
                        self.dep_dict.lookup(token.text, cws[j], rel.relation)
                        or self.dep_dict.lookup(token.text, cws[j], "AGT")
                    )
                    if m:
                        matches.append((DRT_BIAS["AGT"], m, rel.relation, cws[j]))

        for rel in as_dep:
            j = rel.head - 1
            if not (0 <= j < len(cws)):
                continue

            drt = self.drt(rel.relation)

            if drt == "RES":
                m = (
                    self.dep_dict.lookup(token.text, cws[j], rel.relation)
                    or self.dep_dict.lookup(token.text, cws[j], "RES")
                )
                if m:
                    matches.append((DRT_BIAS["RES"], m, rel.relation, cws[j]))

            elif drt != "OTH":
                m = (
                    self.dep_dict.lookup(token.text, cws[j], rel.relation)
                    or self.dep_dict.lookup(token.text, cws[j], drt)
                )
                if m:
                    matches.append((DRT_BIAS[drt], m, rel.relation, cws[j]))

        return sorted(matches, key=lambda x: x[0])

    def select(
        self,
        token,
        *,
        cws,
        deps=(),
        context="",
        con_spans=(),
        pos_candidates=(),
        hanviet_candidates=(),
        locked_terms=(),
    ):
        # CON
        phrases = [p for p in con_spans if token.text in p and p in context]
        for span in sorted(phrases, key=lambda s: (-len(s), s)):
            res = self.resolver.candidates_for(
                span, category="ordinary", context=context
            )
            if res.candidates:
                mandatory = [c for c in res.candidates if c.authority == "mandatory"]
                cand = max(mandatory or list(res.candidates), key=lambda c: c.score)
                return Selection(
                    token.text, cand.target, cand.kind, cand.authority,
                    "PASS", 0.98, "CON",
                    (f"exact CON phrase candidate selected: {span}",),
                )

        # Locked terms
        if token.text in locked_terms:
            res = self.resolver.candidates_for(
                token.text, category="proper_name", context=context
            )
            mandatory = [c for c in res.candidates if c.authority == "mandatory"]
            if mandatory:
                cand = max(mandatory, key=lambda c: c.score)
                return Selection(
                    token.text, cand.target, cand.kind, cand.authority,
                    "PASS", 1.0, "NER/GLOSSARY",
                    ("mandatory locked term",),
                )

        # Real DEP dictionary
        matches = self._dep_lookup(token, deps, cws)
        if matches:
            bias, match, rel, parent = matches[0]
            drt = next(k for k, v in DRT_BIAS.items() if v == bias)
            return Selection(
                token.text, match.child_val, "dep_dict", "lexical",
                "PASS", min(0.94, 0.90 + (10 - bias) * 0.005),
                "DEP/DRT",
                (f"deprel={rel}", f"DRT={drt}", f"parent={parent}"),
            )

        # POS fallback
        for tag, target in pos_candidates:
            if target:
                return Selection(
                    token.text, target, "pos_dict", "lexical",
                    "PASS", 0.80, "POS", (f"POS={tag}",),
                )

        # Hán-Việt fallback
        if hanviet_candidates:
            return Selection(
                token.text, hanviet_candidates[0], "hanviet", "fallback",
                "PASS", 0.65, "HANVIET", ("Hán-Việt fallback",),
            )

        return Selection(
            token.text, None, None, None,
            "REVIEW", 0.40, "REVIEW",
            ("no real dictionary evidence",),
        )
