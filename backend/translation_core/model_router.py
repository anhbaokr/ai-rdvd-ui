from pathlib import Path

from hachimi_local import LocalHachimiTranslator


class KoreanSeparatedTranslator:
    """
    Temporary Korean route.

    This stage only separates Korean from Chinese.
    No Korean model is loaded yet.
    """

    model_name = "KOREAN-SEPARATED-NO-MODEL"

    def translate_one(self, *args, **kwargs):
        raise RuntimeError(
            "Korean route separated. Korean model is not connected yet."
        )

    def translate_candidates(self, *args, **kwargs):
        raise RuntimeError(
            "Korean route separated. Korean model is not connected yet."
        )


def get_translator(source_language: str, assets_root: Path):
    language = str(source_language).strip().lower()

    if language == "zh":
        translator = LocalHachimiTranslator(
            assets_root / "models" / "HachimiMT-60-QT"
        )
        translator.model_name = "HachimiMT-60-QT"
        return translator

    if language == "ko":
        return KoreanSeparatedTranslator()

    raise ValueError(
        f"Unsupported source language: {language}"
    )
