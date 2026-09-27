from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
import time
from typing import Any


RESULT_PREFIX = "AI_RDVD_RESULT:"
PROGRESS_PREFIX = "AI_RDVD_PROGRESS:"
WORKER_VERSION = "1.1.2-vocalize-v010.5-airdvd-zhvi-profile"
HERE = Path(__file__).resolve().parent
CORE = HERE / "translation_core"
if str(CORE) not in sys.path:
    sys.path.insert(0, str(CORE))

from contextual_disambiguator import ContextualDisambiguator
from dictionary_resolver import DictionaryCandidateResolver, find_default_paths
from hachimi_local import LocalHachimiTranslator
from learning_memory import LearningMemory
from meaning_frame import MeaningFrameBuilder
from meaning_guard import MeaningGuard
from semantic_evidence import SemanticEvidenceEvaluator
from terminology_authority import TerminologyAuthorityClassifier
from terminology_planner import TerminologyPlanner
from terminology_registry_v2 import TerminologyRegistryV2


def emit_result(value: dict[str, Any]) -> None:
    print(RESULT_PREFIX + json.dumps(value, ensure_ascii=False), flush=True)


def emit_progress(value: dict[str, Any]) -> None:
    print(PROGRESS_PREFIX + json.dumps(value, ensure_ascii=False), flush=True)


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None




def load_translation_profile(assets_root: Path) -> dict[str, Any]:
    profile_path = assets_root / "profiles" / "zh-vi.json"
    if profile_path.exists():
        return json.loads(profile_path.read_text(encoding="utf-8"))
    return {"id": "zh-vi", "name": "Trung Quốc → Việt Nam", "sourceLanguage": "zh", "targetLanguage": "vi", "engine": "HachimiMT-60-QT"}


def required_paths(assets_root: Path) -> dict[str, Path]:
    cvdict, hanviet, glossary = find_default_paths(assets_root)
    return {
        "model": assets_root / "models" / "HachimiMT-60-QT",
        "ct2_model": assets_root / "models" / "HachimiMT-60-QT" / "ct2-int8_float32" / "model.bin",
        "tokenizer": assets_root / "models" / "HachimiMT-60-QT" / "tokenizer_config.json",
        "cvdict": cvdict,
        "hanviet": hanviet,
        "glossary": glossary,
        "semantic": assets_root / "dictionaries" / "semantic-evidence-v010.json",
        "domain_lexicon": assets_root / "data" / "xianxia-domain-lexicon.json",
    }


def environment_report(assets_root: Path, *, deep_check: bool = False) -> dict[str, Any]:
    paths = required_paths(assets_root)
    versions = {
        "ctranslate2": package_version("ctranslate2"),
        "transformers": package_version("transformers"),
        "sentencepiece": package_version("sentencepiece"),
    }
    diagnostics = [
        f"Worker version: {WORKER_VERSION}",
        f"Python: {sys.executable}",
        f"Assets root: {assets_root}",
    ]
    diagnostics.extend(f"Package {name}: {version or 'missing'}" for name, version in versions.items())
    diagnostics.extend(f"Asset {name}: {path} (exists={path.is_file() if path.suffix else path.exists()})" for name, path in paths.items())
    missing_packages = [name for name, value in versions.items() if value is None]
    missing_assets = [name for name, path in paths.items() if not path.exists()]
    ready = not missing_packages and not missing_assets
    deep_error = None
    if ready and deep_check:
        try:
            started = time.perf_counter()
            translator = LocalHachimiTranslator(paths["model"])
            sample, latency_ms = translator.translate_one("你好。", beam_size=1, max_decoding_length=32)
            if not sample.strip():
                raise RuntimeError("Hachimi returned an empty health-check translation")
            diagnostics.append(f"Deep model check: OK ({latency_ms:.2f}ms, total={(time.perf_counter() - started):.2f}s)")
        except Exception as error:
            ready = False
            deep_error = f"{type(error).__name__}: {error}"
            diagnostics.append(f"Deep model check: ERROR: {deep_error}")
    if ready:
        message = "Mô-đun dịch Vocalize/Hachimi đã sẵn sàng."
    else:
        details = []
        if missing_packages:
            details.append("thiếu package: " + ", ".join(missing_packages))
        if missing_assets:
            details.append("thiếu tài nguyên: " + ", ".join(missing_assets))
        if deep_error:
            details.append("model health check lỗi: " + deep_error)
        message = "Mô-đun dịch chưa sẵn sàng — " + "; ".join(details)
    return {
        "ready": ready,
        "message": message,
        "workerVersion": WORKER_VERSION,
        "pythonPath": sys.executable,
        "assetsRoot": str(assets_root),
        "diagnostics": diagnostics,
    }


def read_json(path: Path, fallback: Any) -> Any:
    if not path.is_file():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def glossary_authority(glossary_path: Path) -> dict[str, tuple[str, str, str]]:
    data = read_json(glossary_path, {})
    return {
        str(item.get("source", "")).strip(): (
            str(item.get("target", "")).strip(),
            str(item.get("category", "ordinary")).strip(),
            str(item.get("authority", "none")).strip(),
        )
        for item in data.get("terms", [])
        if isinstance(item, dict) and item.get("source") and item.get("target")
    }


def normalize_segment(raw: dict[str, Any], index: int) -> dict[str, Any]:
    segment_id = str(raw.get("segmentId") or f"seg-{index + 1:06d}").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,96}", segment_id):
        raise ValueError(f"segmentId không hợp lệ tại vị trí {index + 1}")
    source = str(raw.get("sourceText") or "").strip()
    if not source:
        raise ValueError(f"Nội dung segment {segment_id} đang trống")
    start_ms = max(0, int(raw.get("startMs") or 0))
    end_ms = int(raw.get("endMs") or start_ms + 3000)
    if end_ms <= start_ms:
        raise ValueError(f"Timecode segment {segment_id} không hợp lệ: endMs phải lớn hơn startMs")
    return {
        "segmentId": segment_id,
        "startMs": start_ms,
        "endMs": end_ms,
        "sourceText": source,
    }


def source_digest(segments: list[dict[str, Any]]) -> str:
    payload = json.dumps(segments, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def context_window(segments: list[dict[str, Any]], index: int, radius: int = 2) -> dict[str, Any]:
    start = max(0, index - radius)
    end = min(len(segments), index + radius + 1)
    previous = [segments[pos]["sourceText"] for pos in range(start, index)]
    following = [segments[pos]["sourceText"] for pos in range(index + 1, end)]
    return {
        "previous": previous,
        "current": segments[index]["sourceText"],
        "following": following,
        "text": "\n".join(previous + [segments[index]["sourceText"]] + following),
        "radius": radius,
    }


def frame_for_window(builder: MeaningFrameBuilder, window: dict[str, Any]) -> dict[str, Any]:
    sentences: list[str] = []
    current_index = 0
    for text in window["previous"]:
        pieces = builder.split_sentences(text)
        sentences.extend(pieces or [text])
        current_index += len(pieces or [text])
    current_pieces = builder.split_sentences(window["current"]) or [window["current"]]
    sentences.extend(current_pieces)
    for text in window["following"]:
        sentences.extend(builder.split_sentences(text) or [text])
    framed_text = "。".join(part.rstrip("。！？!?；;") for part in sentences if part.strip()) + "。"
    frame = builder.build(framed_text, sentence_index=current_index, context_radius=window["radius"])
    result = frame.to_dict()
    result["segmentContext"] = {
        "previous": window["previous"],
        "current": window["current"],
        "following": window["following"],
    }
    return result


def status_from_findings(findings: list[dict[str, Any]]) -> str:
    if any(str(item.get("severity", "")).upper() == "ERROR" for item in findings):
        return "FAIL"
    if findings:
        return "REVIEW"
    return "PASS"


def translate_candidates(translator: Any, source: str, limit: int = 4) -> tuple[list[dict[str, Any]], float]:
    """Compatibility adapter for the real translator and lightweight test doubles."""
    if hasattr(translator, "translate_candidates"):
        raw, latency_ms = translator.translate_candidates(source, num_hypotheses=limit)
    else:
        target, latency_ms = translator.translate_one(source)
        raw = [{"target": target, "modelScore": 0.0, "modelRank": 0}]

    candidates=[]
    seen=set()
    for index,item in enumerate(raw or []):
        if isinstance(item,str):
            item={"target":item}
        if not isinstance(item,dict):
            continue
        target=str(item.get("target","")).strip()
        normalized=" ".join(target.lower().split())
        if not target or normalized in seen:
            continue
        seen.add(normalized)
        candidates.append({
            "target":target,
            "modelScore":float(item.get("modelScore",-index)),
            "modelRank":int(item.get("modelRank",index)),
        })
    if not candidates:
        raise RuntimeError("Hachimi không trả về phương án dịch hợp lệ")
    return candidates,float(latency_ms)


def terminology_coverage(target: str, terminology_plan: list[dict[str, Any]]) -> float:
    target_l=target.lower()
    score=0.0
    for item in terminology_plan:
        selected=item.get("selected") if isinstance(item.get("selected"),dict) else None
        if not selected:
            continue
        expected=str(selected.get("target","")).strip().lower()
        if not expected or expected not in target_l:
            continue
        authority=str(selected.get("authority","")).strip()
        source_kind=str(selected.get("sourceKind","")).strip()
        if authority in {"mandatory","series"}:
            score+=8.0
        elif source_kind=="domain_glossary":
            score+=3.0
        elif authority=="contextual":
            score+=2.0
        else:
            score+=0.5
    return score


def evaluate_translation_candidate(
    *,
    index: int,
    source: str,
    candidate: dict[str, Any],
    locked_terms: dict[str,str],
    registry_terms: list[dict[str,Any]],
    terminology_plan: list[dict[str,Any]],
    domain: str | None,
    memory: Any,
    evidence: Any,
) -> dict[str,Any]:
    target=candidate["target"]
    guard=MeaningGuard.check(
        line_no=index+1,
        source=source,
        target=target,
        locked_terms=locked_terms,
        terminology_registry=registry_terms,
        terminology_plan=terminology_plan,
        domain=domain,
        memory=memory,
        semantic_evidence=evidence,
    )
    findings=[
        {"severity":item.severity,"kind":item.kind,"message":item.message}
        for item in guard.findings
    ]
    errors=sum(1 for item in findings if item["severity"].upper()=="ERROR")
    warnings=len(findings)-errors
    coverage=terminology_coverage(target,terminology_plan)
    return {
        **candidate,
        "findings":findings,
        "status":status_from_findings(findings),
        "errorCount":errors,
        "warningCount":warnings,
        "terminologyCoverage":coverage,
        "selectionKey":(-errors,-warnings,coverage,candidate["modelScore"],-candidate["modelRank"]),
    }


def checkpoint_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def load_checkpoint(path: Path, digest: str) -> list[dict[str, Any]]:
    data = read_json(path, {})
    if (
        not isinstance(data, dict)
        or data.get("sourceDigest") != digest
        or data.get("workerVersion") != WORKER_VERSION
    ):
        return []
    results = data.get("segments", [])
    return results if isinstance(results, list) else []


def run_translation(payload: dict[str, Any], assets_root: Path) -> dict[str, Any]:
    profile = load_translation_profile(assets_root)
    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list) or not raw_segments:
        raise ValueError("Yêu cầu dịch không có segment nguồn")
    if len(raw_segments) > 20_000:
        raise ValueError("Một lượt dịch không được vượt quá 20.000 segment")
    segments = [normalize_segment(item, index) for index, item in enumerate(raw_segments) if isinstance(item, dict)]
    if len(segments) != len(raw_segments):
        raise ValueError("Danh sách segment chứa phần tử không hợp lệ")

    job_id = str(payload.get("jobId") or "translation-job")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,96}", job_id):
        raise ValueError("jobId không hợp lệ")
    checkpoint_path = Path(str(payload.get("checkpointPath") or ""))
    cancel_path = Path(str(payload.get("cancelPath") or ""))
    memory_path = Path(str(payload.get("memoryPath") or assets_root / "memory" / "learning.jsonl"))
    digest = source_digest(segments)
    completed = load_checkpoint(checkpoint_path, digest) if bool(payload.get("resume", True)) else []
    completed_by_id = {str(item.get("segmentId")): item for item in completed if isinstance(item, dict)}

    paths = required_paths(assets_root)
    resolver = DictionaryCandidateResolver(paths["cvdict"], paths["hanviet"], paths["glossary"])
    authority = TerminologyAuthorityClassifier(glossary_authority(paths["glossary"]))
    registry = TerminologyRegistryV2(resolver, authority)
    disambiguator = ContextualDisambiguator(resolver)
    frame_builder = MeaningFrameBuilder(resolver, disambiguator)
    domain_lexicon = read_json(paths["domain_lexicon"], {"strong": [], "medium": [], "negative": []})
    planner = TerminologyPlanner(resolver, domain_terms=set(domain_lexicon.get("strong", [])) | set(domain_lexicon.get("medium", [])), domain_lexicon=domain_lexicon)
    semantic_resource = read_json(paths["semantic"], {})
    memory = LearningMemory(memory_path)
    translator = LocalHachimiTranslator(paths["model"])

    results: list[dict[str, Any]] = []
    counts = {"PASS": 0, "REVIEW": 0, "FAIL": 0}
    started = time.perf_counter()
    total = len(segments)

    for index, segment in enumerate(segments):
        if cancel_path.is_file():
            raise InterruptedError("Tác vụ dịch đã được người dùng hủy")
        cached = completed_by_id.get(segment["segmentId"])
        if cached and cached.get("sourceText") == segment["sourceText"]:
            result = cached
            result["resumed"] = True
        else:
            window = context_window(segments, index)
            frame = frame_for_window(frame_builder, window)
            registry_terms = registry.as_dicts(segment["sourceText"])
            terminology_plan = []
            for item in registry_terms:
                decision = planner.plan(item["source"], context=window["text"], category=item.get("category", "ordinary"))
                terminology_plan.append({
                    "source": decision.source,
                    "status": decision.status,
                    "domain": decision.domain,
                    "reviewRequired": decision.status == "REVIEW" and (
                        item.get("authority") in {"mandatory", "series", "contextual"}
                        or item.get("kind") == "domain_glossary"
                    ),
                    "selected": None if decision.selected is None else {
                        "target": decision.selected.target,
                        "sourceKind": decision.selected.source_kind,
                        "authority": decision.selected.authority,
                        "score": decision.selected.score,
                    },
                    "reasons": list(decision.reasons),
                })
            locked_terms = {
                item["source"]: item["target"]
                for item in registry_terms
                if item.get("authority") in {"mandatory", "series"}
            }
            evidence = SemanticEvidenceEvaluator.from_registry(registry_terms, semantic_resource=semantic_resource)
            hypotheses, latency_ms = translate_candidates(translator, segment["sourceText"])
            evaluated = [
                evaluate_translation_candidate(
                    index=index,
                    source=segment["sourceText"],
                    candidate=candidate,
                    locked_terms=locked_terms,
                    registry_terms=registry_terms,
                    terminology_plan=terminology_plan,
                    domain=frame.get("domain"),
                    memory=memory,
                    evidence=evidence,
                )
                for candidate in hypotheses
            ]
            selected=max(evaluated,key=lambda item:item["selectionKey"])
            target=selected["target"]
            findings=selected["findings"]
            status=selected["status"]
            result = {
                **segment,
                "targetText": target,
                "status": status,
                "findings": findings,
                "terms": registry_terms,
                "terminologyPlan": terminology_plan,
                "meaningFrame": frame,
                "translationSelection": {
                    "strategy": "hachimi-nbest-terminology-guard-rerank",
                    "candidateCount": len(evaluated),
                    "selectedModelRank": selected["modelRank"],
                    "selectedModelScore": selected["modelScore"],
                    "terminologyCoverage": selected["terminologyCoverage"],
                    "alternatives": [
                        {
                            "modelRank": item["modelRank"],
                            "modelScore": item["modelScore"],
                            "status": item["status"],
                            "findingKinds": [finding["kind"] for finding in item["findings"]],
                            "selected": item is selected,
                        }
                        for item in evaluated
                    ],
                },
                "latencyMs": round(latency_ms, 2),
                "resumed": False,
            }
        results.append(result)
        status = str(result.get("status", "REVIEW"))
        counts[status] = counts.get(status, 0) + 1
        checkpoint_write(checkpoint_path, {
            "schema": "ai-rdvd.translation-checkpoint.v1",
            "workerVersion": WORKER_VERSION,
            "jobId": job_id,
            "sourceDigest": digest,
            "completed": len(results),
            "total": total,
            "segments": results,
        })
        emit_progress({
            "jobId": job_id,
            "completed": index + 1,
            "total": total,
            "segmentId": segment["segmentId"],
            "status": status,
        })

    overall = "FAIL" if counts.get("FAIL", 0) else "REVIEW" if counts.get("REVIEW", 0) else "PASS"
    return {
        "schema": "ai-rdvd.translation-result.v1",
        "workerVersion": WORKER_VERSION,
        "jobId": job_id,
        "sourceDigest": digest,
        # Profile metadata (new ZH-VI architecture)
        "profile": profile,
        "profileId": profile.get("id", "zh-vi"),
        # Keep the legacy contract unchanged for Timeline/Pipeline adapters.
        # The frontend must continue receiving the same translation payload shape.
        "sourceLanguage": profile.get("sourceLanguage", "zh"),
        "targetLanguage": profile.get("targetLanguage", "vi"),
        "status": overall,
        "accepted": overall == "PASS",
        "counts": counts,
        "segments": results,
        "elapsedMs": round((time.perf_counter() - started) * 1000.0, 2),
        "model": "ngocdang83/HachimiMT-60-QT/ct2-int8_float32",
        "checkpointPath": str(checkpoint_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--deep-check", action="store_true")
    parser.add_argument("--assets-root", required=True)
    args = parser.parse_args()
    assets_root = Path(args.assets_root).resolve()
    if args.check:
        emit_result(environment_report(assets_root, deep_check=args.deep_check))
        return 0

    report = environment_report(assets_root)
    if not report["ready"]:
        raise RuntimeError(report["message"])
    payload = json.load(sys.stdin)
    emit_result(run_translation(payload, assets_root))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except InterruptedError as error:
        print(f"CANCELLED: {error}", file=sys.stderr, flush=True)
        raise SystemExit(130)
    except Exception as error:
        print(f"TRANSLATION ERROR: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
