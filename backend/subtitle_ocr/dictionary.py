from pathlib import Path
import json


def apply_dictionary(text):

    root = Path(__file__).resolve().parent.parent

    files = [
        root / "dictionary" / "char_fix.json",
        root / "dictionary" / "custom_terms.json"
    ]

    for file in files:

        if file.exists():

            data = json.loads(
                file.read_text(
                    encoding="utf-8"
                )
            )

            for old, new in data.items():
                text = text.replace(
                    old,
                    new
                )

    return text