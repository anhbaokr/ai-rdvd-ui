import json
from pathlib import Path


def format_time(seconds):
    seconds = float(seconds)

    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)

    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_timeline(subtitles, output):

    output = Path(output)

    data = []
    srt_lines = []

    for index, sub in enumerate(subtitles, start=1):

        zh = sub.get("zh", "").strip()

        if not zh:
            continue

        start = sub.get(
            "start",
            sub.get("time", 0)
        )

        end = sub.get(
            "end",
            start + 1
        )

        item = {
            "id": index,
            "start": start,
            "end": end,
            "zh": zh
        }

        data.append(item)

        srt_lines.append(
            str(index)
        )

        srt_lines.append(
            f"{format_time(start)} --> {format_time(end)}"
        )

        srt_lines.append(
            zh
        )

        srt_lines.append(
            ""
        )


    json_output = output.with_suffix(".json")

    json_output.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=4,
            default=str
        ),
        encoding="utf-8"
    )


    srt_output = output.with_suffix(".srt")

    srt_output.write_text(
        "\n".join(srt_lines),
        encoding="utf-8"
    )


    print("Timeline JSON saved:", json_output)
    print("Timeline SRT saved:", srt_output)
