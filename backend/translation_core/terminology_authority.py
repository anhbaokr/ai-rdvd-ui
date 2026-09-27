from __future__ import annotations
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class AuthorityDecision:
    source: str
    category: str
    authority: str
    status: str
    confidence: float
    reasons: tuple[str, ...] = ()


class TerminologyAuthorityClassifier:
    """
    Classifies terminology authority without generating a translation.

    Categories:
      proper_name
      named_artifact
      soft_domain
      ordinary

    Important design rule from the test corpus:
      - a Chinese string is NOT a proper name merely because it can be read
        as a name;
      - evidence must come from local glossary authority, lexical shape,
        contextual title/name markers, or explicit artifact markers;
      - ambiguous cases remain REVIEW.

    This classifier is intentionally conservative because downstream
    TerminologyPlanner must not force Hán-Việt on ordinary objects.
    """

    NAME_SUFFIXES = (
        "师兄","师姐","师弟","师妹","师叔","师伯","师祖","长老",
        "掌门","殿下","王爷","郡主","公子","姑娘","真人",
    )

    ARTIFACT_MARKERS = (
        "剑","印","令","令牌","法印","法器","法宝","幡","镜","符",
        "阵盘","阵旗","古剑","飞剑",
    )

    DOMAIN_MARKERS = (
        "筑基","金丹","元婴","炼气","渡劫","心魔","元神","神魂",
        "丹田","经脉","灵根","灵力","真气","功法","修炼","闭关",
        "法宝","秘境","雷劫","神通","飞升","血阵","聚灵阵",
        "炼丹","炼器","灵药","妖兽","灵兽","兽契","兽潮",
        "魔道","禁术","夺舍","血祭","炼魂","残魂",
    )

    AMBIGUITY_MARKERS = (
        "可能","不确定","不能确认","不足以","不要认定","不能直接",
        "不一定","未必","才是","表示方位","只是方向","职能说明",
        "若","如果","只有","才把","才算","才可","方可",
    )

    def __init__(self, glossary=None):
        self.glossary = glossary or {}

    def classify(self, source: str, *, context: str = "", observed_sentence: str | None = None):
        source = source.strip()
        context = context or ""
        observed = observed_sentence or context

        # 1) Explicit local glossary authority always wins.
        if source in self.glossary:
            entry = self.glossary[source]
            authority = entry[2] if len(entry) >= 3 else "mandatory"
            if authority in {"mandatory", "series"}:
                category = "proper_name"
                if any(m in source for m in self.ARTIFACT_MARKERS):
                    category = "named_artifact"
                return AuthorityDecision(
                    source, category, authority, "PASS", 1.0,
                    ("explicit local glossary authority",),
                )

        # 2) Corpus uncertainty language means we must not canonicalize.
        if any(marker in observed for marker in self.AMBIGUITY_MARKERS):
            return AuthorityDecision(
                source, "ordinary", "none", "REVIEW", 0.35,
                ("conditional/uncertain context; terminology authority not established",),
            )

        # 3) Strong name evidence: title/name marker immediately follows source.
        if any(context.find(source + suffix) >= 0 for suffix in self.NAME_SUFFIXES):
            return AuthorityDecision(
                source, "proper_name", "contextual", "PASS", 0.88,
                ("source is used with a personal-name/title marker",),
            )

        # 4) Strong artifact evidence: source is a lexical artifact term and
        # context asserts naming/identity or object status.
        artifact_hit = any(marker in source for marker in self.ARTIFACT_MARKERS)
        artifact_context = any(
            cue in observed for cue in ("名为","名叫","此剑","法器","法印","令为","不可借给","已经认主")
        )
        if artifact_hit and artifact_context:
            return AuthorityDecision(
                source, "named_artifact", "contextual", "PASS", 0.90,
                ("artifact marker plus explicit artifact context",),
            )

        # 5) Soft-domain evidence.
        if any(marker in source for marker in self.DOMAIN_MARKERS):
            return AuthorityDecision(
                source, "soft_domain", "lexical", "PASS", 0.82,
                ("recognized cultivation/domain terminology",),
            )

        # 6) Bare artifact-shaped word with no naming evidence is not forced.
        if artifact_hit:
            return AuthorityDecision(
                source, "ordinary", "none", "REVIEW", 0.45,
                ("artifact-shaped word lacks sufficient naming authority",),
            )

        return AuthorityDecision(
            source, "ordinary", "none", "PASS", 0.70,
            ("no stronger terminology authority evidence",),
        )
