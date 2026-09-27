from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import time


@dataclass(frozen=True)
class TranslationResult:
    line_no: int
    source: str
    target: str
    latency_ms: float
    status: str
    reason: str


class LocalHachimiTranslator:
    """
    CPU-local inference adapter for ngocdang83/HachimiMT-60-QT.

    Preferred runtime:
      CTranslate2 INT8 CPU export shipped by the model.

    The model card documents:
      tokenizer = AutoTokenizer.from_pretrained(...)
      ctranslate2.Translator(..., device="cpu", compute_type="int8_float32")
      tokenizer.convert_ids_to_tokens(...)
      translate_batch(...)
      tokenizer.decode(...)

    This adapter never calls an API. It requires an already downloaded local
    model directory.
    """

    def __init__(self, model_dir: Path):
        self.model_dir = Path(model_dir)
        self.ct2_dir = self.model_dir / "ct2-int8_float32"

        if not self.ct2_dir.is_dir():
            raise FileNotFoundError(
                f"Missing CTranslate2 directory: {self.ct2_dir}"
            )

        self._load_runtime()

    def _load_runtime(self):
        try:
            import ctranslate2
            from transformers import AutoTokenizer
        except ImportError as exc:
            raise RuntimeError(
                "Missing local inference dependencies. "
                "Install ctranslate2 and transformers in the lab venv."
            ) from exc

        self.ctranslate2 = ctranslate2
        self.tokenizer = AutoTokenizer.from_pretrained(
            str(self.model_dir),
            local_files_only=True,
        )
        self.translator = ctranslate2.Translator(
            str(self.ct2_dir),
            device="cpu",
            compute_type="int8_float32",
        )

    def translate_candidates(
        self,
        source: str,
        *,
        beam_size: int = 4,
        max_decoding_length: int = 256,
        num_hypotheses: int = 4,
    ) -> tuple[list[dict], float]:
        t0=time.perf_counter()

        encoded=self.tokenizer(
            source,
            add_special_tokens=True,
            return_attention_mask=False,
        )
        toks=self.tokenizer.convert_ids_to_tokens(encoded.input_ids)

        result=self.translator.translate_batch(
            [toks],
            beam_size=max(beam_size, num_hypotheses),
            max_decoding_length=max_decoding_length,
            num_hypotheses=max(1, num_hypotheses),
            return_scores=True,
        )

        output=result[0]
        scores=list(getattr(output, "scores", ()) or ())
        candidates=[]
        seen=set()
        for index,hyp in enumerate(output.hypotheses):
            ids=self.tokenizer.convert_tokens_to_ids(hyp)
            target=self.tokenizer.decode(ids,skip_special_tokens=True).strip()
            normalized=" ".join(target.lower().split())
            if not target or normalized in seen:
                continue
            seen.add(normalized)
            candidates.append({
                "target": target,
                "modelScore": float(scores[index]) if index < len(scores) else float(-index),
                "modelRank": index,
            })
        latency=(time.perf_counter()-t0)*1000.0
        if not candidates:
            raise RuntimeError("Hachimi returned no usable translation hypothesis")
        return candidates,latency

    def translate_one(self, source: str, *, beam_size: int = 4, max_decoding_length: int = 256) -> tuple[str, float]:
        candidates,latency=self.translate_candidates(
            source,
            beam_size=beam_size,
            max_decoding_length=max_decoding_length,
            num_hypotheses=1,
        )
        return candidates[0]["target"],latency
