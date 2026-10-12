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
        self.ocr = PaddleOCR(lang=profile["ocr_lang"], show_log=False)

    def normalize_text(self, text):
        if not text:
            return ""
        return " ".join(text.split()).strip()

    def recognize(self, image):
        result = self.ocr.ocr(image, cls=False)
        text = ""
        try:
            for page in result:
                if not page:
                    continue
                for item in page:
                    if isinstance(item, list):
                        text += " " + item[1][0]
        except Exception as e:
            print("OCR PARSE ERROR:", e)
        return text.strip()

    def process(self, video):
        cap = cv2.VideoCapture(video)
        if not cap.isOpened():
            print("VIDEO OPEN FAILED:", video)
            return None

        fps = cap.get(cv2.CAP_PROP_FPS)
        if not fps or fps <= 0:
            fps = 25.0

        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frame_id = 0

        stabilizer = SubtitleStabilizer(
            blank_grace_seconds=max(0.18, 6.0 / fps),
            minimum_duration_seconds=max(0.04, 3.0 / fps),
        )

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            if frame_id % 3 == 0:
                h, w = frame.shape[:2]
                roi = frame[int(h * 0.50):h, 0:w]
                raw = self.recognize(roi)
                print("FRAME:", frame_id, "OCR:", repr(raw))

                text = self.normalize_text(apply_dictionary(raw))
                split = split_chinese_english(text)
                zh = split["zh"].strip()

                # Send every sampled observation, including repeated text
                # and blank frames, so cue end time reflects real visibility.
                stabilizer.add({"time": frame_id / fps, "zh": zh})

            frame_id += 1

            if frame_id % 300 == 0:
                print("Progress:", frame_id, "/", total)

        cap.release()

        root = Path(__file__).resolve().parent.parent
        output = root / "output" / "subtitle.timeline.txt"
        subtitles = stabilizer.finish()
        write_timeline(subtitles, output)
        return output
