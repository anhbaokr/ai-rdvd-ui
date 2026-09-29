import difflib


class SubtitleStabilizer:


    def __init__(self):

        self.current = None
        self.results = []


    def normalize(self, text):

        if not text:
            return ""

        return " ".join(
            text.strip().split()
        )


    def is_chinese_noise(self, zh):

        if not zh:
            return True

        noise = [
            "囍",
            "囍囍",
            "喜",
            "哈哈哈",
            "0",
            "A211"
        ]

        return self.normalize(zh) in noise


    def similarity(self, a, b):

        return difflib.SequenceMatcher(
            None,
            self.normalize(a),
            self.normalize(b)
        ).ratio()


    def add(self, subtitle):

        zh = self.normalize(
            subtitle.get("zh", "")
        )

        if self.is_chinese_noise(zh):
            return


        time = subtitle.get(
            "time",
            0
        )


        if self.current is None:

            self.current = {
                "start": time,
                "end": time,
                "zh": zh
            }

            return


        score = self.similarity(
            self.current["zh"],
            zh
        )


        if score >= 0.85:

            self.current["end"] = time

            if len(zh) > len(self.current["zh"]):
                self.current["zh"] = zh

            return


        # câu mới xuất hiện:
        # đóng thời gian câu cũ tại thời điểm này
        self.current["end"] = time

        self.results.append(
            self.current
        )


        self.current = {
            "start": time,
            "end": time,
            "zh": zh
        }


    def finish(self, video_duration=None):

        if self.current:

            # nếu hết video mà câu cuối vẫn đang mở
            # dùng thời lượng video làm end time
            if video_duration is not None:
                self.current["end"] = video_duration

            elif self.current["end"] <= self.current["start"]:
                self.current["end"] = self.current["start"] + 0.5

            self.results.append(
                self.current
            )


        return self.results
