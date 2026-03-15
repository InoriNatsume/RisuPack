#!/usr/bin/env python3
"""
extract.py — module.json → src/ 역추출 (1회성)

Usage:
    python extract.py <project_dir> [input_filename]
    input_filename 기본값: module_patched.json
"""

import json
import re
import sys
from pathlib import Path

# ─── 설정 ───────────────────────────────────────────────

# CSS 로어북: comment 패턴 → 파일명 매핑
CSS_COMMENT_SUFFIX = ".CSS"

# Lua 로어북: content가 Lua 코드인지 휴리스틱 판별
LUA_INDICATORS = ["local ", "function ", "return ", "require("]


def strip_style_tags(content: str) -> str:
    """<style>...</style> 래핑 제거"""
    content = content.strip()
    if content.startswith("<style>"):
        content = content[len("<style>"):]
    if content.endswith("</style>"):
        content = content[:-len("</style>")]
    content = content.strip("\n")
    return content


def safe_filename(comment: str) -> str:
    """파일명으로 안전한 문자열로 변환"""
    name = re.sub(r'[<>:"/\\|?*]', '_', comment)
    return name


def is_css_lorebook(comment: str, content: str) -> bool:
    """CSS 로어북인지 판별"""
    if comment.upper().endswith(CSS_COMMENT_SUFFIX):
        return True
    stripped = content.strip()
    return stripped.startswith("<style>") and stripped.endswith("</style>")


def is_lua_lorebook(content: str) -> bool:
    """Lua 코드 로어북인지 판별"""
    trimmed = content.lstrip()
    return any(trimmed.startswith(ind) for ind in LUA_INDICATORS)


def extract(project_dir: Path, input_filename: str):
    input_path = project_dir / input_filename
    if not input_path.exists():
        print(f"Error: {input_path} not found")
        sys.exit(1)

    src_dir = project_dir / "src"
    styles_dir = src_dir / "styles"
    lorebook_dir = src_dir / "lorebook"

    styles_dir.mkdir(parents=True, exist_ok=True)
    lorebook_dir.mkdir(parents=True, exist_ok=True)

    with open(input_path, "r", encoding="utf-8") as f:
        module = json.load(f)

    # ─── 1. 트리거 Lua 코드 추출 ───
    triggers = module.get("trigger", [])
    for ti, trigger in enumerate(triggers):
        for ei, effect in enumerate(trigger.get("effect", [])):
            if effect.get("type") == "triggerlua" and "code" in effect:
                fname = "trigger.lua" if ti == 0 and ei == 0 else f"trigger_{ti}_{ei}.lua"
                code = effect["code"]
                with open(src_dir / fname, "w", encoding="utf-8", newline="\n") as f:
                    f.write(code)
                print(f"  [OK] {fname} ({len(code):,} chars)")

    # ─── 2. 로어북 추출 ───
    lorebook_meta = []

    for i, entry in enumerate(module.get("lorebook", [])):
        comment = entry.get("comment", f"entry_{i}")
        content = entry.get("content", "")
        meta = {k: v for k, v in entry.items() if k != "content"}

        if is_css_lorebook(comment, content):
            filename = safe_filename(comment) + ".css"
            css_content = strip_style_tags(content)
            with open(styles_dir / filename, "w", encoding="utf-8", newline="\n") as f:
                f.write(css_content + "\n")
            meta["_source_file"] = f"src/styles/{filename}"
            meta["_type"] = "css"
            print(f"  [OK] styles/{filename} ({len(css_content):,} chars)")

        elif is_lua_lorebook(content):
            filename = safe_filename(comment) + ".lua"
            with open(lorebook_dir / filename, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            meta["_source_file"] = f"src/lorebook/{filename}"
            meta["_type"] = "lua"
            print(f"  [OK] lorebook/{filename} ({len(content):,} chars)")

        else:
            filename = safe_filename(comment) + ".md"
            with open(lorebook_dir / filename, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)
            meta["_source_file"] = f"src/lorebook/{filename}"
            meta["_type"] = "text"
            print(f"  [OK] lorebook/{filename} ({len(content):,} chars)")

        lorebook_meta.append(meta)

    meta_path = lorebook_dir / "_meta.json"
    with open(meta_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(lorebook_meta, f, ensure_ascii=False, indent=2)
    print(f"  [OK] lorebook/_meta.json ({len(lorebook_meta)} entries)")

    # ─── 3. backgroundEmbedding CSS 추출 ───
    bg_embedding = module.get("backgroundEmbedding", "")
    if bg_embedding:
        css_content = strip_style_tags(bg_embedding)
        with open(styles_dir / "embedding.css", "w", encoding="utf-8", newline="\n") as f:
            f.write(css_content + "\n")
        print(f"  [OK] styles/embedding.css ({len(css_content):,} chars)")

    # ─── 4. module.meta.json 생성 ───
    meta_module = {}
    skip_keys = {"lorebook", "backgroundEmbedding"}
    for k, v in module.items():
        if k in skip_keys:
            continue
        if k == "trigger":
            triggers_copy = json.loads(json.dumps(v))
            for t in triggers_copy:
                for eff in t.get("effect", []):
                    if eff.get("type") == "triggerlua" and "code" in eff:
                        eff["code"] = "__SOURCE__:src/trigger.lua"
            meta_module[k] = triggers_copy
        else:
            meta_module[k] = v

    meta_module["backgroundEmbedding"] = "__SOURCE__:src/styles/embedding.css"
    meta_module["lorebook"] = "__BUILD_FROM__:src/lorebook/_meta.json"

    with open(project_dir / "module.meta.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(meta_module, f, ensure_ascii=False, indent=2)
    print(f"  [OK] module.meta.json")

    print(f"\nDone! {len(lorebook_meta)} lorebook + trigger + embedding CSS extracted.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract.py <project_dir> [input_filename]")
        sys.exit(1)
    proj = Path(sys.argv[1]).resolve()
    fname = sys.argv[2] if len(sys.argv) > 2 else "module_patched.json"
    print(f"Project: {proj}")
    print(f"Input:   {fname}\n")
    extract(proj, fname)
