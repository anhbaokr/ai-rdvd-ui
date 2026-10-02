import argparse
import json
import sys
from pathlib import Path

try:
    from .ocr_engine import OCRSubtitleEngine
except ImportError:
    from ocr_engine import OCRSubtitleEngine


OCR_PROFILE = {
    "ocr_lang": "ch",
}

RESULT_PREFIX = "AI_RDVD_RESULT:"
LOG_PREFIX = "AI_RDVD_LOG:"


def emit_log(level, category, message):
    print(
        LOG_PREFIX
        + json.dumps(
            {
                "level": level,
                "category": category,
                "message": message,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


def emit_result(payload):
    print(
        RESULT_PREFIX
        + json.dumps(payload, ensure_ascii=False),
        flush=True,
    )


def process_video(video_path):
    output_dir = Path(__file__).resolve().parent.parent / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    engine = OCRSubtitleEngine(OCR_PROFILE)
    return engine.process(video_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video_path")
    parser.add_argument("--mode", default="subtitle", choices=("voice", "subtitle", "both"))
    parser.add_argument("--source-language", default="zh", choices=("zh", "ko"))
    args = parser.parse_args()

    if args.source_language != "zh":
        message = "Korean OCR worker is not integrated in this baseline."
        emit_log("ERROR", "RECOGNITION", message)
        emit_result({"error": message})
        return 2

    if args.mode == "voice":
        message = "Dialogue ASR worker is not integrated in this baseline."
        emit_log("ERROR", "RECOGNITION", message)
        emit_result({"error": message})
        return 2

    try:
        emit_log("INFO", "RECOGNITION", f"Recognition worker started. mode={args.mode} source={args.source_language}")
        if args.mode == "both":
            emit_log(
                "WARN",
                "RECOGNITION",
                "Mode=both: OCR subtitle branch will run; ASR branch is not integrated in this baseline.",
            )

        emit_log("INFO", "OCR", f"Input video: {args.video_path}")
        result = process_video(args.video_path)
        if result is None:
            message = f"Unable to open video: {args.video_path}"
            emit_log("ERROR", "OCR", message)
            emit_result({"error": message})
            return 1

        emit_log("INFO", "OCR", f"Timeline generated: {result}")
        emit_result(
            {
                "timelineBasePath": str(result),
                "engine": "PaddleOCR PP-OCRv4",
            }
        )
        emit_log("INFO", "RECOGNITION", "Recognition worker completed.")
        return 0
    except Exception as error:
        emit_log("ERROR", "RECOGNITION", str(error))
        emit_result({"error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
