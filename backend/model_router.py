from __future__ import annotations

class ModelNotAvailable(RuntimeError):
    pass


MODEL_REGISTRY = {
    "zh-vi": {
        "language": "zh",
        "engine": "HachimiMT-60-QT",
        "status": "active",
    },
    "ko-vi": {
        "language": "ko",
        "engine": None,
        "status": "waiting_model",
    },
}


def get_translation_route(source_language: str):
    key = f"{source_language}-vi"
    return MODEL_REGISTRY.get(key)


def ensure_model_available(source_language: str):
    route = get_translation_route(source_language)
    if route and route.get("status") == "waiting_model":
        raise ModelNotAvailable(
            "Korean translation model is not configured. Waiting for Korean-Vietnamese model integration."
        )
    return route
