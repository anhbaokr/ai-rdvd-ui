import json
import sys

from .ocr_engine import OCRSubtitleEngine


OCR_PROFILE = {
    "ocr_lang": "ch"
}


def process_video(video_path):

    engine = OCRSubtitleEngine(
        OCR_PROFILE
    )

    result = engine.process(
        video_path
    )

    return result


def main():

    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "missing video path"
        }))
        return


    video_path = sys.argv[1]


    try:

        result = process_video(
            video_path
        )

        print(
            json.dumps(
                str(result),
                ensure_ascii=False,
                indent=2
            )
        )


    except Exception as e:

        print(
            json.dumps(
                {
                    "error": str(e)
                },
                ensure_ascii=False
            )
        )


if __name__ == "__main__":
    main()