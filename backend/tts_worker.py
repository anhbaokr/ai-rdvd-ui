"""Isolated VieNeu worker used by the Tauri backend.

Input is one JSON document on stdin. The worker writes a single machine-readable
result line prefixed with AI_RDVD_RESULT so model download logs cannot corrupt IPC.
"""

from __future__ import annotations

import argparse
import gc
import importlib.util
import importlib.metadata
import json
import os
import platform
import re
import sys
import time
from pathlib import Path
from typing import Any

RESULT_PREFIX = "AI_RDVD_RESULT:"
PROGRESS_PREFIX = "AI_RDVD_PROGRESS:"


def configure_utf8_streams() -> None:
    """Make Windows console redirection deterministic, including legacy code pages."""
    os.environ.setdefault("PYTHONUTF8", "1")
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="backslashreplace")


def emit(value: dict[str, Any]) -> None:
    # ASCII-only JSON is intentional: it remains safe even when a child library
    # replaces stdout with a legacy Windows code page.
    print(f"{RESULT_PREFIX}{json.dumps(value, ensure_ascii=True)}", flush=True)


def emit_progress(*, phase: str, completed: int, total: int, percent: int, message: str) -> None:
    print(f"{PROGRESS_PREFIX}{json.dumps({
        'phase': phase,
        'completed': completed,
        'total': total,
        'percent': max(0, min(100, percent)),
        'message': message,
    }, ensure_ascii=True)}", flush=True)


def package_version(name: str) -> str:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return "not-installed"


def check_environment() -> int:
    diagnostics = [
        f"Python: {sys.version.split()[0]} ({sys.executable})",
        f"Platform: {platform.platform()}",
        f"Console encoding: stdout={sys.stdout.encoding}, stderr={sys.stderr.encoding}",
    ]
    missing = [name for name in ("vieneu", "librosa", "soundfile") if importlib.util.find_spec(name) is None]
    if missing:
        diagnostics.append(f"Missing modules: {', '.join(missing)}")
        emit({"ready": False, "message": f"Thiếu module Python: {', '.join(missing)}", "diagnostics": diagnostics})
        return 0
    import librosa  # noqa: F401 - import verifies compiled/runtime dependencies
    import soundfile  # noqa: F401
    from vieneu.v3turbo import V3TurboVieNeuTTS  # noqa: F401

    diagnostics.extend([
        f"vieneu={package_version('vieneu')}",
        f"librosa={package_version('librosa')}",
        f"soundfile={package_version('soundfile')}",
        "Backend configuration: onnx / cpu / fp32",
    ])
    emit({"ready": True, "message": "VieNeu v3 Turbo ONNX/CPU đã sẵn sàng.", "diagnostics": diagnostics})
    return 0


def load_engine(backend: str, device: str, dtype: str):
    # This is the exact class/API used to verify the 23 preset voices.
    from vieneu.v3turbo import V3TurboVieNeuTTS

    return V3TurboVieNeuTTS(backend=backend, device=device, dtype=dtype)


def split_tts_text(text: str, max_chars: int = 120) -> list[str]:
    """Bound decoder memory while preserving sentence order and wording."""
    sentences = [part.strip() for part in re.split(r"(?<=[.!?…])\s+|[\r\n]+", text) if part.strip()]
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        words = sentence.split()
        parts: list[str] = []
        piece = ""
        for word in words:
            candidate = f"{piece} {word}".strip()
            if piece and len(candidate) > max_chars:
                parts.append(piece)
                piece = word
            else:
                piece = candidate
        if piece:
            parts.append(piece)
        for part in parts:
            candidate = f"{current} {part}".strip()
            if current and len(candidate) > max_chars:
                chunks.append(current)
                current = part
            else:
                current = candidate
    if current:
        chunks.append(current)
    return chunks or [text]


def _synthesize_chunk(engine, text: str, voice_name: str, speed: float, pitch: float, sample_rate: int):
    import librosa
    import numpy as np

    audio = engine.infer(text=text, voice=voice_name, speed=speed)
    audio_chunk = np.asarray(audio, dtype=np.float32).squeeze()
    if pitch:
        audio_chunk = librosa.effects.pitch_shift(audio_chunk, sr=sample_rate, n_steps=pitch)
    if audio_chunk.ndim != 1 or audio_chunk.size == 0:
        raise RuntimeError("VieNeu returned invalid audio.")
    return audio_chunk


def _fit_audio_to_duration(audio_chunk, target_samples: int, sample_rate: int):
    import librosa
    import numpy as np

    if target_samples <= 0 or audio_chunk.size <= target_samples:
        return audio_chunk
    target_seconds = target_samples / sample_rate
    actual_seconds = audio_chunk.size / sample_rate
    if target_seconds <= 0 or actual_seconds <= 0:
        return audio_chunk[:target_samples]
    rate = max(1.0, actual_seconds / target_seconds)
    stretched = librosa.effects.time_stretch(audio_chunk, rate=rate)
    return np.asarray(stretched, dtype=np.float32).squeeze()[:target_samples]


def generate() -> int:
    import numpy as np
    import soundfile as sf
    request = json.load(sys.stdin)
    text = str(request.get("text", "")).strip()
    voice_name = str(request.get("voiceName", "")).strip()
    speed = float(request.get("speed", 1.0))
    pitch = float(request.get("pitch", 0.0))
    output_path = Path(str(request["outputPath"]))
    backend = str(request.get("backend", "onnx"))
    device = str(request.get("device", "cpu"))
    dtype = str(request.get("dtype", "fp32"))
    cues = request.get("cues") or []

    if not text and not cues:
        raise ValueError("Nội dung tạo giọng đang trống.")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    emit_progress(phase="engine", completed=0, total=max(1, len(cues)), percent=1, message="Đang nạp VieNeu TTS")
    started = time.perf_counter()
    engine = load_engine(backend, device, dtype)
    engine_seconds = time.perf_counter() - started
    preset_names = {voice_id for _, voice_id in engine.list_preset_voices()}
    if voice_name not in preset_names:
        raise ValueError(f"VieNeu không có preset voice: {voice_name}")
    emit_progress(phase="engine", completed=0, total=max(1, len(cues)), percent=8, message="VieNeu TTS đã sẵn sàng")

    sample_rate = 48_000
    inference_started = time.perf_counter()
    silence = np.zeros(int(sample_rate * 0.08), dtype=np.float32)
    diagnostics: list[str] = []

    if cues:
        normalized_cues = []
        for index, cue in enumerate(cues, start=1):
            segment_id = str(cue.get("segmentId", f"seg-{index:06d}")).strip()
            start_ms = max(0, int(cue.get("startMs", 0)))
            end_ms = int(cue.get("endMs", start_ms + 250))
            text_value = str(cue.get("text", "")).strip()
            if not text_value or end_ms <= start_ms:
                continue
            normalized_cues.append((segment_id, start_ms, end_ms, text_value))
        normalized_cues.sort(key=lambda item: (item[1], item[2], item[0]))
        if not normalized_cues:
            raise ValueError("Không có cue TTS hợp lệ.")

        placed: list[tuple[int, np.ndarray]] = []
        cue_results: list[dict[str, Any]] = []
        master_length = 0
        for index, (segment_id, start_ms, end_ms, cue_text) in enumerate(normalized_cues, start=1):
            cue_started = time.perf_counter()
            audio_chunk = _synthesize_chunk(engine, cue_text, voice_name, speed, pitch, sample_rate)
            target_samples = max(1, int(round((end_ms - start_ms) / 1000 * sample_rate)))
            fitted = _fit_audio_to_duration(audio_chunk, target_samples, sample_rate)
            start_sample = int(round(start_ms / 1000 * sample_rate))
            actual_end_sample = start_sample + len(fitted)
            master_length = max(master_length, actual_end_sample, int(round(end_ms / 1000 * sample_rate)))
            placed.append((start_sample, fitted))
            cue_results.append({
                "segmentId": segment_id,
                "startMs": start_ms,
                "endMs": end_ms,
                "text": cue_text,
                "actualStartMs": start_ms,
                "actualEndMs": int(round(actual_end_sample / sample_rate * 1000)),
                "durationSeconds": round(len(fitted) / sample_rate, 3),
            })
            diagnostics.append(
                f"Cue {index}/{len(normalized_cues)}: {segment_id} — {len(cue_text)} chars, {time.perf_counter() - cue_started:.2f}s"
            )
            emit_progress(
                phase="synthesis",
                completed=index,
                total=len(normalized_cues),
                percent=8 + round(index / len(normalized_cues) * 86),
                message=f"Đang tạo câu {index}/{len(normalized_cues)} — {segment_id}",
            )
            del audio_chunk, fitted
            gc.collect()

        master = np.zeros(master_length, dtype=np.float32)
        for start_sample, audio_chunk in placed:
            end_sample = min(master_length, start_sample + len(audio_chunk))
            if start_sample < master_length and end_sample > start_sample:
                master[start_sample:end_sample] += audio_chunk[:end_sample - start_sample]
        peak = float(np.max(np.abs(master))) if master.size else 0.0
        gain = 1.0
        if peak > 1e-6:
            # A2 owns an independent 0 dB preview bus. Normalize clean TTS to
            # a stable peak while capping upward gain at +12 dB.
            gain = min(4.0, 0.92 / peak)
            master *= gain
        diagnostics.append(f"A2 peak normalization: input={peak:.6f}, gain={gain:.4f}, target<=0.92")
        audio_array = master
        inference_seconds = time.perf_counter() - inference_started
        emit_progress(phase="writing", completed=len(cue_results), total=len(cue_results), percent=97, message="Đang ghi WAV đã căn timecode")
        sf.write(output_path, audio_array, sample_rate, subtype="PCM_16")
        duration = float(len(audio_array) / sample_rate) if sample_rate else 0.0
        emit_progress(phase="completed", completed=len(cue_results), total=len(cue_results), percent=100, message="Đã tạo WAV lồng tiếng")
        emit({
            "outputPath": str(output_path),
            "voiceName": voice_name,
            "durationSeconds": round(duration, 3),
            "sampleRate": sample_rate,
            "aligned": True,
            "cues": cue_results,
            "diagnostics": [
                f"Engine loaded in {engine_seconds:.2f}s ({backend}/{device}/{dtype})",
                f"Preset voices detected: {len(preset_names)}; selected: {voice_name}",
                f"Aligned cue count: {len(cue_results)}",
                f"Inference completed in {inference_seconds:.2f}s",
                f"WAV written: {output_path} ({output_path.stat().st_size} bytes)",
                *diagnostics,
            ],
        })
        return 0

    chunks = split_tts_text(text)
    audio_parts: list[np.ndarray] = []
    for index, chunk in enumerate(chunks, start=1):
        chunk_started = time.perf_counter()
        audio_chunk = _synthesize_chunk(engine, chunk, voice_name, speed, pitch, sample_rate)
        if audio_parts:
            audio_parts.append(silence)
        audio_parts.append(audio_chunk)
        diagnostics.append(f"Chunk {index}/{len(chunks)}: {len(chunk)} chars, {time.perf_counter() - chunk_started:.2f}s")
        emit_progress(
            phase="synthesis",
            completed=index,
            total=len(chunks),
            percent=8 + round(index / len(chunks) * 86),
            message=f"Đang tạo đoạn {index}/{len(chunks)}",
        )
        del audio_chunk
        gc.collect()
    inference_seconds = time.perf_counter() - inference_started
    audio_array = np.concatenate(audio_parts) if len(audio_parts) > 1 else audio_parts[0]
    peak = float(np.max(np.abs(audio_array))) if audio_array.size else 0.0
    gain = min(4.0, 0.92 / peak) if peak > 1e-6 else 1.0
    audio_array *= gain
    diagnostics.append(f"A2 peak normalization: input={peak:.6f}, gain={gain:.4f}, target<=0.92")
    emit_progress(phase="writing", completed=len(chunks), total=len(chunks), percent=97, message="Đang ghi WAV")
    sf.write(output_path, audio_array, sample_rate, subtype="PCM_16")
    duration = float(len(audio_array) / sample_rate) if sample_rate else 0.0
    emit_progress(phase="completed", completed=len(chunks), total=len(chunks), percent=100, message="Đã tạo WAV lồng tiếng")
    emit({
        "outputPath": str(output_path),
        "voiceName": voice_name,
        "durationSeconds": round(duration, 3),
        "sampleRate": sample_rate,
        "aligned": False,
        "diagnostics": [
            f"Engine loaded in {engine_seconds:.2f}s ({backend}/{device}/{dtype})",
            f"Preset voices detected: {len(preset_names)}; selected: {voice_name}",
            f"Input characters: {len(text)}; chunks={len(chunks)}; speed={speed}; pitch={pitch}",
            f"Inference completed in {inference_seconds:.2f}s",
            f"WAV written: {output_path} ({output_path.stat().st_size} bytes)",
            *diagnostics,
        ],
    })
    return 0

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        return check_environment()
    return generate()


if __name__ == "__main__":
    configure_utf8_streams()
    try:
        raise SystemExit(main())
    except Exception as exc:  # Tauri captures stderr and displays it in the UI.
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        raise SystemExit(1)
