from __future__ import annotations

import unittest

from backend import translation_worker as worker


class MeaningGuardRepetitionTest(unittest.TestCase):
    def findings_for(self, target: str):
        result = worker.MeaningGuard.check(
            line_no=1,
            source="测试",
            target=target,
            terminology_registry=[],
        )
        return [item for item in result.findings if item.kind == "repetition"]

    def test_two_separated_occurrences_are_not_flagged(self):
        self.assertEqual(self.findings_for("Một thanh kiếm và một thanh đao."), [])

    def test_sentence_word_and_proper_name_are_distinct(self):
        self.assertEqual(
            self.findings_for("Thanh kiếm đó tên là Thanh Vân, đã theo chủ nhân nhiều năm."),
            [],
        )

    def test_three_lexical_occurrences_are_flagged(self):
        findings = self.findings_for("Kiếm này chạm kiếm kia rồi cả ba thanh kiếm cùng rung.")
        self.assertEqual(len(findings), 1)
        self.assertIn("at least three times", findings[0].message)

    def test_immediately_repeated_phrase_is_flagged(self):
        findings = self.findings_for("Thanh kiếm thanh kiếm bay lên.")
        self.assertTrue(any("adjacent phrase" in item.message for item in findings))

    def test_separated_long_phrase_repetition_is_flagged(self):
        findings = self.findings_for(
            "Cần rất nhiều Vũ Đức chân khí cần lượng lớn Vũ Đức chân khí."
        )
        self.assertTrue(any("repeated phrase" in item.message for item in findings))

    def test_two_adjacent_single_words_are_not_a_repeated_phrase(self):
        self.assertEqual(self.findings_for("Sao sao vừa mở mắt đã ở nơi này?"), [])

    def test_duplicated_proper_name_is_not_flagged_at_two_occurrences(self):
        self.assertEqual(self.findings_for("Thác Thác thiếu hiệp đã đến."), [])

    def test_single_source_term_realized_twice_is_reviewed(self):
        result = worker.MeaningGuard.check(
            line_no=1,
            source="需要大量的武德真气",
            target="Cần rất nhiều Vũ Đức chân khí cần lượng lớn Vũ Đức chân khí.",
            terminology_registry=[{
                "source":"武德真气",
                "target":"Vũ Đức chân khí",
                "category":"soft_domain",
                "authority":"lexical",
            }],
        )
        self.assertTrue(any(item.kind == "term_realization_duplication" for item in result.findings))

    def test_two_source_occurrences_allow_two_term_realizations(self):
        result = worker.MeaningGuard.check(
            line_no=1,
            source="武德真气与武德真气",
            target="Vũ Đức chân khí và Vũ Đức chân khí.",
            terminology_registry=[{
                "source":"武德真气",
                "target":"Vũ Đức chân khí",
                "category":"soft_domain",
                "authority":"lexical",
            }],
        )
        self.assertFalse(any(item.kind == "term_realization_duplication" for item in result.findings))

    def test_actionable_planner_review_cannot_silently_become_pass(self):
        result = worker.MeaningGuard.check(
            line_no=1,
            source="玄冰铁",
            target="Huyền băng thiết",
            terminology_registry=[],
            terminology_plan=[{
                "source":"玄冰铁",
                "status":"REVIEW",
                "reviewRequired":True,
                "selected":None,
            }],
        )
        self.assertTrue(any(item.kind == "terminology_plan_review" for item in result.findings))

    def test_weak_lexical_review_does_not_pollute_segment_status(self):
        result = worker.MeaningGuard.check(
            line_no=1,
            source="也要帮助我们",
            target="Cũng muốn giúp chúng ta.",
            terminology_registry=[],
            terminology_plan=[{
                "source":"也要",
                "status":"REVIEW",
                "reviewRequired":False,
                "selected":None,
            }],
        )
        self.assertFalse(any(item.kind == "terminology_plan_review" for item in result.findings))

    def test_missing_selected_domain_glossary_is_reviewed_not_failed(self):
        result = worker.MeaningGuard.check(
            line_no=1,
            source="聚灵阵",
            target="Trận pháp tụ linh",
            terminology_registry=[],
            terminology_plan=[{
                "source":"聚灵阵",
                "status":"PASS",
                "selected":{
                    "target":"Tụ Linh Trận",
                    "sourceKind":"domain_glossary",
                    "authority":"lexical",
                },
            }],
        )
        finding = next(item for item in result.findings if item.kind == "planned_term_missing")
        self.assertEqual(finding.severity, "WARN")


if __name__ == "__main__":
    unittest.main()
