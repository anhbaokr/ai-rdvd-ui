# OCRSubtitleEngine Chinese First Version

import cv2
from pathlib import Path

from .dictionary import apply_dictionary
from .timeline import write_timeline
from paddleocr import PaddleOCR
from .subtitle_splitter import split_chinese_english
from .subtitle_stabilizer import SubtitleStabilizer


class OCRSubtitleEngine:


    def __init__(self, profile):

        print("Loading PaddleOCR...")

        self.ocr = PaddleOCR(
            lang=profile["ocr_lang"],
            show_log=False
        )


    def normalize_text(self, text):

        if not text:
            return ""

        text = " ".join(
            text.split()
        )

        return text.strip()



    def recognize(self, image):

        result = self.ocr.ocr(
            image,
            cls=False
        )

        text = ""

        try:

            for page in result:

                if not page:
                    continue

                for item in page:

                    if isinstance(item, list):

                        txt = item[1][0]

                        text += " " + txt

        except Exception as e:

            print(
                "OCR PARSE ERROR:",
                e
            )

        return text.strip()



    def process(self, video):

        cap = cv2.VideoCapture(video)

        if not cap.isOpened():

            print(
                "VIDEO OPEN FAILED:",
                video
            )

            return None


        fps = cap.get(
            cv2.CAP_PROP_FPS
        )


        total = int(
            cap.get(
                cv2.CAP_PROP_FRAME_COUNT
            )
        )


        frame_id = 0
        last_zh = ""

        stabilizer = SubtitleStabilizer()


        while True:

            ok, frame = cap.read()

            if not ok:
                break


            if frame_id % 3 == 0:

                h, w = frame.shape[:2]


                roi = frame[
                    int(h * 0.50):h,
                    0:w
                ]


                raw = self.recognize(
                    roi
                )


                print(
                    "FRAME:",
                    frame_id,
                    "OCR:",
                    repr(raw)
                )


                text = apply_dictionary(
                    raw
                )


                text = self.normalize_text(
                    text
                )


                split = split_chinese_english(
                    text
                )


                zh = split["zh"].strip()


                # chỉ lấy tiếng Trung làm mục tiêu
                if zh and zh != last_zh:

                    stabilizer.add(
                        {
                            "time": frame_id / fps,
                            "zh": zh
                        }
                    )

                    last_zh = zh



            frame_id += 1


            if frame_id % 300 == 0:

                print(
                    "Progress:",
                    frame_id,
                    "/",
                    total
                )


        cap.release()


        root = Path(
            __file__
        ).resolve().parent.parent


        output = (
            root
            / "output"
            / "subtitle.timeline.txt"
        )


        subtitles = stabilizer.finish()


        write_timeline(
            subtitles,
            output
        )


        return output
