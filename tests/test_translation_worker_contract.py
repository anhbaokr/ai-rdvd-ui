from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

from backend import translation_worker as worker


class FakeTranslator:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir

    def translate_one(self, source: str, **_kwargs):
        if source == "错误":
            return "错误", 1.0
        return "Đây là bản dịch kiểm thử.", 1.0


class FakeNBestTranslator:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir

    def translate_candidates(self, source: str, **_kwargs):
        return [
            {
                "target":"Cần rất nhiều Vũ Đức chân khí cần lượng lớn Vũ Đức chân khí.",
                "modelScore":-0.05,
                "modelRank":0,
            },
            {
                "target":"Cần một lượng lớn Vũ Đức chân khí.",
                "modelScore":-0.25,
                "modelRank":1,
            },
        ],2.0


def make_assets(root: Path) -> None:
    paths = [
        root / "models/HachimiMT-60-QT/ct2-int8_float32/model.bin",
        root / "models/HachimiMT-60-QT/tokenizer_config.json",
        root / "sources/CVDICT/CVDICT.u8",
        root / "sources/hanviet-pinyin-wordlist/hanviet.csv",
        root / "dictionaries/domain-glossary.json",
        root / "dictionaries/semantic-evidence-v010.json",
        root / "data/xianxia-domain-lexicon.json",
    ]
    for path in paths:
        path.parent.mkdir(parents=True, exist_ok=True)
    paths[0].write_bytes(b"test")
    paths[1].write_text("{}\n", encoding="utf-8")
    paths[2].write_text("", encoding="utf-8")
    paths[3].write_text("char,hanviet,pinyin\n", encoding="utf-8")
    paths[4].write_text('{"schema":"test","terms":[]}\n', encoding="utf-8")
    paths[5].write_text('{"schema":"test","concepts":{}}\n', encoding="utf-8")
    paths[6].write_text('{"strong":[],"medium":[],"negative":[]}\n', encoding="utf-8")


class TranslationWorkerContractTest(unittest.TestCase):
    def test_nbest_rejects_repeated_long_phrase_without_registry_support(self):
        original = worker.LocalHachimiTranslator
        worker.LocalHachimiTranslator = FakeNBestTranslator
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                make_assets(root)
                payload = {
                    "jobId":"nbest-no-registry-test",
                    "segments":[{
                        "segmentId":"001",
                        "startMs":0,
                        "endMs":2000,
                        "sourceText":"需要大量的武德真气",
                    }],
                    "checkpointPath":str(root / "jobs/nbest.checkpoint.json"),
                    "cancelPath":str(root / "jobs/nbest.cancel"),
                    "memoryPath":str(root / "memory/learning.jsonl"),
                    "resume":False,
                }
                result=worker.run_translation(payload,root)
                segment=result["segments"][0]
                self.assertEqual(segment["targetText"],"Cần một lượng lớn Vũ Đức chân khí.")
                self.assertEqual(segment["translationSelection"]["selectedModelRank"],1)
                alternatives=segment["translationSelection"]["alternatives"]
                self.assertIn("repetition",alternatives[0]["findingKinds"])
        finally:
            worker.LocalHachimiTranslator = original

    def test_nbest_reranking_rejects_duplicated_terminology_realization(self):
        original = worker.LocalHachimiTranslator
        worker.LocalHachimiTranslator = FakeNBestTranslator
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                make_assets(root)
                (root / "dictionaries/domain-glossary.json").write_text(json.dumps({
                    "schema":"test",
                    "terms":[{
                        "source":"武德真气",
                        "target":"Vũ Đức chân khí",
                        "category":"soft_domain",
                        "authority":"lexical",
                        "confidence":1.0,
                    }],
                },ensure_ascii=False),encoding="utf-8")
                (root / "data/xianxia-domain-lexicon.json").write_text(json.dumps({
                    "strong":["真气"],"medium":[],"negative":[],
                },ensure_ascii=False),encoding="utf-8")
                payload = {
                    "jobId":"nbest-test",
                    "segments":[{
                        "segmentId":"001",
                        "startMs":0,
                        "endMs":2000,
                        "sourceText":"需要大量的武德真气",
                    }],
                    "checkpointPath":str(root / "jobs/nbest.checkpoint.json"),
                    "cancelPath":str(root / "jobs/nbest.cancel"),
                    "memoryPath":str(root / "memory/learning.jsonl"),
                    "resume":False,
                }
                result=worker.run_translation(payload,root)
                segment=result["segments"][0]
                self.assertEqual(segment["targetText"],"Cần một lượng lớn Vũ Đức chân khí.")
                self.assertEqual(segment["status"],"PASS")
                self.assertEqual(segment["translationSelection"]["selectedModelRank"],1)
                alternatives=segment["translationSelection"]["alternatives"]
                self.assertIn("term_realization_duplication",alternatives[0]["findingKinds"])
        finally:
            worker.LocalHachimiTranslator = original

    def test_pass_fail_checkpoint_and_resume_contract(self):
        original = worker.LocalHachimiTranslator
        worker.LocalHachimiTranslator = FakeTranslator
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                make_assets(root)
                checkpoint = root / "jobs/test.checkpoint.json"
                payload = {
                    "jobId": "contract-test",
                    "segments": [
                        {"segmentId": "seg-000001", "startMs": 0, "endMs": 1000, "sourceText": "你好"},
                        {"segmentId": "seg-000002", "startMs": 1000, "endMs": 2000, "sourceText": "错误"},
                    ],
                    "checkpointPath": str(checkpoint),
                    "cancelPath": str(root / "jobs/test.cancel"),
                    "memoryPath": str(root / "memory/learning.jsonl"),
                    "resume": True,
                }
                result = worker.run_translation(payload, root)
                self.assertEqual(result["status"], "FAIL")
                self.assertFalse(result["accepted"])
                self.assertEqual(result["counts"], {"PASS": 1, "REVIEW": 0, "FAIL": 1})
                self.assertTrue(checkpoint.is_file())
                stored = json.loads(checkpoint.read_text(encoding="utf-8"))
                self.assertEqual(stored["completed"], 2)

                resumed = worker.run_translation(payload, root)
                self.assertTrue(all(item["resumed"] for item in resumed["segments"]))
        finally:
            worker.LocalHachimiTranslator = original

    def test_segment_validation(self):
        with self.assertRaises(ValueError):
            worker.normalize_segment({"segmentId": "bad/id", "sourceText": "你好"}, 0)

    def test_segment_timecode_is_preserved_to_the_millisecond(self):
        segment = worker.normalize_segment({
            "segmentId": "001",
            "startMs": 1400,
            "endMs": 1501,
            "sourceText": "不好",
        }, 0)
        self.assertEqual(segment["startMs"], 1400)
        self.assertEqual(segment["endMs"], 1501)

    def test_invalid_timecode_is_rejected(self):
        with self.assertRaises(ValueError):
            worker.normalize_segment({
                "segmentId": "001",
                "startMs": 1400,
                "endMs": 1400,
                "sourceText": "不好",
            }, 0)


if __name__ == "__main__":
    unittest.main()
