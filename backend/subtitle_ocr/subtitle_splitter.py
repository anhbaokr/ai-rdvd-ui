import re


def split_chinese_english(text):

    if not text:
        return {
            "zh": "",
            "en": ""
        }


    chinese = "".join(
        re.findall(
            r'[\u4e00-\u9fff]+',
            text
        )
    )


    english = re.sub(
        r'[\u4e00-\u9fff]',
        '',
        text
    )


    return {
        "zh": chinese.strip(),
        "en": english.strip()
    }