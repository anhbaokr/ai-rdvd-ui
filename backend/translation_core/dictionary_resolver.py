from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from collections import Counter
import csv, json, re, unicodedata

@dataclass(frozen=True)
class Candidate:
    source: str
    target: str
    kind: str
    authority: str
    score: float
    note: str = ""

@dataclass(frozen=True)
class Resolution:
    span: str
    selected: Candidate | None
    candidates: tuple[Candidate, ...]

class DictionaryCandidateResolver:
    CEDICT_RE = re.compile(
        r"^(?P<trad>\S+)\s+(?P<simp>\S+)\s+\[(?P<pinyin>[^\]]*)\]\s+/(?P<defs>.*)/\s*$"
    )

    def __init__(self, cvdict_path=None, hanviet_csv=None, domain_glossary_path=None):
        self.cvdict_path = Path(cvdict_path) if cvdict_path else None
        self.hanviet_csv = Path(hanviet_csv) if hanviet_csv else None
        self.domain_glossary_path = Path(domain_glossary_path) if domain_glossary_path else None
        self.cvdict = {}
        self.hanviet = {}
        self.hanviet_by_char = {}
        self.pinyin_freq = {}
        self.glossary = {}
        self.cvdict_records = 0
        self.cvdict_parse_failures = 0
        self._load_cvdict()
        self._load_hanviet()
        self._load_glossary()

    @staticmethod
    def normalize_pinyin(value: str) -> str:
        value = (value or "").strip().lower()
        if not value:
            return ""
        out = []
        tone_map = {"\u0304":"1","\u0301":"2","\u030c":"3","\u0300":"4"}
        for syl in value.split():
            syl = syl.replace("u:", "v").replace("ü", "v")
            if syl and syl[-1].isdigit():
                out.append(syl)
                continue
            normalized = unicodedata.normalize("NFD", syl)
            chars = []
            tone = None
            for ch in normalized:
                if unicodedata.combining(ch):
                    tone = tone_map.get(unicodedata.normalize("NFD", ch), tone)
                    continue
                chars.append(ch)
            base = "".join(chars).replace("ü", "v")
            out.append(base + (tone or ""))
        return " ".join(out)

    @staticmethod
    def _clean_defs(value: str) -> str:
        # CVDICT definitions are slash-delimited and may include annotation
        # fields such as LT:...|... or [notes]. Strip those annotations
        # wherever they occur, without dropping preceding lexical senses.
        parts = []
        for raw in value.split("/"):
            d = raw.strip()
            if not d:
                continue
            # Remove bracketed source annotations.
            d = re.sub(r"\[[^\]]*\]", "", d).strip()
            # Remove common annotation tokens and everything after the token.
            d = re.sub(
                r"(?:^|\s)(?:LT|CL|TW|MO|HK|variant|see)\s*:\s*.*$",
                "",
                d,
                flags=re.I,
            ).strip()
            if d:
                parts.append(d)
        # Normalize repeated separators/whitespace.
        return " / ".join(dict.fromkeys(parts))

    @staticmethod
    def _clean_hv(value: str) -> str:
        value = value.strip()
        value = re.sub(r"^\s*\[(.*)\]\s*$", r"\1", value)
        value = value.replace("'", "").replace('"', "")
        return re.sub(r"\s+", " ", value).strip()

    def _add_cvdict(self, key, target, pinyin, form):
        key = key.strip()
        target = self._clean_defs(target)
        py = self.normalize_pinyin(pinyin)
        if not key or not target:
            return
        rec = (target, py, form)
        if rec not in self.cvdict.setdefault(key, []):
            self.cvdict[key].append(rec)

    def _load_cvdict(self):
        if not self.cvdict_path or not self.cvdict_path.exists():
            return
        with self.cvdict_path.open("r", encoding="utf-8-sig", errors="replace") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                m = self.CEDICT_RE.match(line)
                if m:
                    trad, simp = m.group("trad"), m.group("simp")
                    py, defs = m.group("pinyin"), m.group("defs")
                    self._add_cvdict(simp, defs, py, "simplified")
                    self._add_cvdict(trad, defs, py, "traditional")
                    for ch in set(simp):
                        self.pinyin_freq.setdefault(ch, Counter()).update(self.normalize_pinyin(py).split())
                    self.cvdict_records += 1
                else:
                    parts = line.split("\t")
                    if len(parts) >= 2:
                        self._add_cvdict(parts[0], parts[-1], parts[2] if len(parts) >= 3 else "", "tabular")
                        self.cvdict_records += 1
                    else:
                        self.cvdict_parse_failures += 1

    def _load_hanviet(self):
        if not self.hanviet_csv or not self.hanviet_csv.exists():
            return
        with self.hanviet_csv.open("r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                ch = (row.get("char") or "").strip()
                hv = self._clean_hv(row.get("hanviet") or "")
                py = self.normalize_pinyin(row.get("pinyin") or "")
                if ch and hv and py:
                    self.hanviet[(ch, py)] = hv
                    self.hanviet_by_char.setdefault(ch, []).append((py, hv))

    def _load_glossary(self):
        if not self.domain_glossary_path or not self.domain_glossary_path.exists():
            return
        data = json.loads(self.domain_glossary_path.read_text(encoding="utf-8"))
        for item in data.get("terms", []):
            src = str(item.get("source", "")).strip()
            tgt = str(item.get("target", "")).strip()
            cat = str(item.get("category", "soft_domain"))
            auth = str(item.get("authority", "series"))
            if src and tgt:
                self.glossary[src] = (tgt, cat, auth)

    def _char_hv_candidates(self, text, max_per_char=3):
        pools = []
        for ch in text:
            rows = self.hanviet_by_char.get(ch, [])
            if not rows:
                return []
            freq = self.pinyin_freq.get(ch, Counter())
            rows = sorted(rows, key=lambda x: (freq.get(x[0], 0), len(x[1])), reverse=True)[:max_per_char]
            pools.append(rows)
        out = [("", 0)]
        for pool in pools:
            nxt = []
            for current, score in out:
                for py, hv in pool:
                    nxt.append(((current + " " + hv).strip(), score + 1))
            out = nxt[:12]
        return [
            Candidate(text, t, "hanviet_char", "lexical", 0.60, "character-level Hán-Việt candidate")
            for t, _ in out if t
        ]

    @staticmethod
    def _dedupe_candidates(items):
        seen = set()
        out = []
        for c in items:
            key = (c.source, c.target, c.kind, c.authority, c.note)
            if key not in seen:
                seen.add(key)
                out.append(c)
        return out

    def candidates_for(self, span, *, pinyin=None, category="ordinary", context=""):
        text = span.strip()
        found = []

        if text in self.glossary:
            tgt, cat, auth = self.glossary[text]
            found.append(
                Candidate(
                    text, tgt, "domain_glossary",
                    "mandatory" if auth in {"mandatory", "series"} else "lexical",
                    1.00, "explicit local domain/series glossary"
                )
            )

        query_py = self.normalize_pinyin(pinyin or "")
        exact_entries = self.cvdict.get(text, [])

        for target, rec_py, form in exact_entries:
            if query_py and rec_py and rec_py != query_py:
                continue
            found.append(
                Candidate(
                    text, target, "cvdict_phrase", "lexical", 0.82,
                    f"exact CVDICT; pinyin={rec_py}"
                )
            )

        if query_py:
            chars = list(text)
            ps = query_py.split()
            if len(chars) == len(ps) and all((ch, p) in self.hanviet for ch, p in zip(chars, ps)):
                found.append(
                    Candidate(
                        text,
                        " ".join(self.hanviet[(ch, p)] for ch, p in zip(chars, ps)),
                        "hanviet_pinyin", "lexical", 0.80,
                        "Pinyin-conditioned Hán-Việt"
                    )
                )

        if not exact_entries and text not in self.glossary:
            found.extend(self._char_hv_candidates(text))

        if query_py and not any(c.kind == "hanviet_pinyin" for c in found):
            chars = list(text)
            ps = query_py.split()
            if len(chars) == len(ps):
                hv_parts = []
                ok = True
                for ch, p in zip(chars, ps):
                    hv = self.hanviet.get((ch, p))
                    if not hv:
                        ok = False
                        break
                    hv_parts.append(hv)
                if ok:
                    found.append(
                        Candidate(
                            text, " ".join(hv_parts), "hanviet_pinyin", "lexical", 0.80,
                            "Pinyin-conditioned Hán-Việt"
                        )
                    )

        if category in {"proper_name", "named_artifact", "locked_term"}:
            found = [
                Candidate(
                    c.source, c.target, c.kind, "mandatory",
                    max(c.score, 0.90),
                    c.note + "; authority promoted"
                )
                for c in found
            ]

        found = self._dedupe_candidates(found)

        selected = None
        if category in {"proper_name", "named_artifact", "locked_term"} and found:
            selected = max(found, key=lambda c: c.score)

        return Resolution(text, selected, tuple(found))

    def stats(self):
        return {
            "cvdict_records": self.cvdict_records,
            "cvdict_index_keys": len(self.cvdict),
            "cvdict_parse_failures": self.cvdict_parse_failures,
            "cvdict_character_keys": len({ch for k in self.cvdict for ch in k}),
            "hanviet_pinyin_entries": len(self.hanviet),
            "domain_glossary_entries": len(self.glossary),
        }

def find_default_paths(lab):
    lab = Path(lab)
    cs = list(lab.glob("sources/**/CVDICT.u8"))
    hs = list(lab.glob("sources/**/hanviet.csv"))
    return (
        cs[0] if cs else lab / "sources/CVDICT/CVDICT.u8",
        hs[0] if hs else lab / "sources/hanviet-pinyin-wordlist/hanviet.csv",
        lab / "dictionaries/domain-glossary.json",
    )
