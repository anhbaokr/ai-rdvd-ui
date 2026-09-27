from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import time
from urllib.request import Request, urlopen


MODEL_REPO = "ngocdang83/HachimiMT-60-QT"
GITHUB_SOURCES = {
    "CVDICT": {
        "repo": "ph0ngp/CVDICT",
        "files": ["CVDICT.u8", "README.md"],
        "destination": "sources/CVDICT",
    },
    "hanviet-pinyin-wordlist": {
        "repo": "ph0ngp/hanviet-pinyin-wordlist",
        "files": ["hanviet.csv", "README.md", "LICENSE"],
        "destination": "sources/hanviet-pinyin-wordlist",
    },
}


def request_bytes(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "AI-RDvD-translation-installer/1.0"})
    with urlopen(request, timeout=120) as response:
        return response.read()


def github_head(repo: str) -> str:
    data = json.loads(request_bytes(f"https://api.github.com/repos/{repo}/commits/main"))
    sha = str(data.get("sha", "")).strip()
    if not sha:
        raise RuntimeError(f"Cannot resolve GitHub revision for {repo}")
    return sha


def download_github_assets(root: Path) -> dict[str, str]:
    revisions: dict[str, str] = {}
    for name, spec in GITHUB_SOURCES.items():
        repo = str(spec["repo"])
        revision = github_head(repo)
        revisions[repo] = revision
        destination = root / str(spec["destination"])
        destination.mkdir(parents=True, exist_ok=True)
        for relative in spec["files"]:
            relative = str(relative)
            url = f"https://raw.githubusercontent.com/{repo}/{revision}/{relative}"
            (destination / Path(relative).name).write_bytes(request_bytes(url))
        print(f"[GITHUB] {name}: {revision}", flush=True)
    return revisions


def download_model(root: Path, requested_revision: str) -> str:
    from huggingface_hub import HfApi, snapshot_download

    api = HfApi(token=os.environ.get("HF_TOKEN"))
    info = api.model_info(MODEL_REPO, revision=requested_revision)
    revision = str(info.sha)
    destination = root / "models" / "HachimiMT-60-QT"
    destination.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=MODEL_REPO,
        revision=revision,
        local_dir=str(destination),
        token=os.environ.get("HF_TOKEN"),
        allow_patterns=[
            "config.json",
            "source.spm",
            "target.spm",
            "vocab.json",
            "tokenizer_config.json",
            "special_tokens_map.json",
            "generation_config.json",
            "LICENSE*",
            "README*",
            "ct2-int8_float32/*",
        ],
    )
    print(f"[MODEL] {MODEL_REPO}: {revision}", flush=True)
    return revision


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(root: Path, sources: dict[str, str], install_mode: str) -> Path:
    files = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.name == "installed.json":
            continue
        files.append({
            "path": path.relative_to(root).as_posix(),
            "size": path.stat().st_size,
            "sha256": sha256(path),
        })
    manifest = {
        "schema": "ai-rdvd.translation-assets.v1",
        "installedAtUnix": int(time.time()),
        "installMode": install_mode,
        "sources": sources,
        "files": files,
    }
    path = root / "installed.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def copy_template(template: Path, root: Path) -> None:
    if not template.is_dir():
        raise FileNotFoundError(f"Missing translation template: {template}")
    shutil.copytree(template, root, dirs_exist_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-root", required=True)
    parser.add_argument("--template-root")
    parser.add_argument("--model-revision", default=os.environ.get("AI_RDVD_HACHIMI_REVISION", "main"))
    parser.add_argument("--manifest-only", action="store_true")
    parser.add_argument("--source", default="download")
    args = parser.parse_args()

    root = Path(args.assets_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    if args.template_root:
        copy_template(Path(args.template_root).resolve(), root)

    if args.manifest_only:
        sources = {"mode": args.source}
    else:
        github_revisions = download_github_assets(root)
        model_revision = download_model(root, args.model_revision)
        sources = {
            "model": {"repo": MODEL_REPO, "revision": model_revision},
            "github": github_revisions,
        }
    manifest = write_manifest(root, sources, args.source)
    print(f"[MANIFEST] {manifest}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
