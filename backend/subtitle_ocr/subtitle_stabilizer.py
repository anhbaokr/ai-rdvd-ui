import difflib


class SubtitleStabilizer:
    def __init__(self, blank_grace_seconds=0.22, minimum_duration_seconds=0.08):
        self.current = None
        self.results = []
        self.blank_grace_seconds = max(0.0, float(blank_grace_seconds))
        self.minimum_duration_seconds = max(0.001, float(minimum_duration_seconds))
        self.blank_since = None

    def normalize(self, text):
        if not text:
            return ""
        return " ".join(text.strip().split())

    def is_chinese_noise(self, zh):
        if not zh:
            return True
        return self.normalize(zh) in ["囍", "囍囍", "喜", "哈哈哈", "0", "A211"]

    def similarity(self, a, b):
        return difflib.SequenceMatcher(None, self.normalize(a), self.normalize(b)).ratio()

    def _append_current(self, explicit_end=None):
        if not self.current:
            return
        start = float(self.current["start"])
        end = float(self.current["end"] if explicit_end is None else explicit_end)
        end = max(end, start + self.minimum_duration_seconds)
        item = dict(self.current)
        item["start"] = start
        item["end"] = end
        self.results.append(item)
        self.current = None
        self.blank_since = None

    def _observe_blank(self, time_value):
        if not self.current:
            self.blank_since = None
            return
        time_value = float(time_value)
        if self.blank_since is None:
            self.blank_since = time_value
        if time_value - float(self.current["end"]) >= self.blank_grace_seconds:
            self._append_current()

    def add(self, subtitle):
        time_value = float(subtitle.get("time", 0))
        zh = self.normalize(subtitle.get("zh", ""))

        if self.is_chinese_noise(zh):
            self._observe_blank(time_value)
            return

        if self.current is None:
            self.current = {"start": time_value, "end": time_value, "zh": zh}
            self.blank_since = None
            return

        score = self.similarity(self.current["zh"], zh)
        if score >= 0.85:
            self.current["end"] = time_value
            if len(zh) > len(self.current["zh"]):
                self.current["zh"] = zh
            self.blank_since = None
            return

        if self.blank_since is None:
            self._append_current(explicit_end=time_value)
        else:
            self._append_current()

        self.current = {"start": time_value, "end": time_value, "zh": zh}
        self.blank_since = None

    def finish(self, video_duration=None):
        if self.current:
            end = float(self.current["end"])
            if video_duration is not None:
                end = min(end, float(video_duration))
            self._append_current(explicit_end=end)
        return self.results
