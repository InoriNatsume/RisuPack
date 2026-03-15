#!/usr/bin/env python3
"""
build.py — src/ → dist/module.json 빌드

Usage:
    python build.py <project_dir> [--pack]
    --pack: risum-tool로 .risum 패킹도 수행
"""

import json
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).parent
RISUM_TOOL = SKILL_DIR.parent / "risum-tool" / "index.mjs"


def wrap_style(css_content: str) -> str:
    """CSS를 <style>...</style>로 래핑"""
    return f"<style>\n{css_content.strip()}\n</style>"


def read_source(base_dir: Path, source_ref: str) -> str:
    """소스 파일 참조를 읽어서 내용 반환"""
    filepath = base_dir / source_ref
    if not filepath.exists():
        raise FileNotFoundError(f"Source file not found: {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        return f.read()


def build(project_dir: Path, do_pack: bool = False):
    meta_path = project_dir / "module.meta.json"
    dist_dir = project_dir / "dist"
    output_path = dist_dir / "module.json"

    with open(meta_path, "r", encoding="utf-8") as f:
        module = json.load(f)

    # ─── 1. 트리거 Lua 코드 삽입 ───
    for trigger in module.get("trigger", []):
        for effect in trigger.get("effect", []):
            code_ref = effect.get("code", "")
            if isinstance(code_ref, str) and code_ref.startswith("__SOURCE__:"):
                source_path = code_ref[len("__SOURCE__:"):]
                code = read_source(project_dir, source_path)
                effect["code"] = code
                print(f"  [OK] trigger code <- {source_path} ({len(code):,} chars)")

    # ─── 2. 로어북 재조립 ───
    lorebook_meta_ref = module.get("lorebook", "")
    if isinstance(lorebook_meta_ref, str) and lorebook_meta_ref.startswith("__BUILD_FROM__:"):
        meta_ref = lorebook_meta_ref[len("__BUILD_FROM__:"):]
        meta_full_path = project_dir / meta_ref
        with open(meta_full_path, "r", encoding="utf-8") as f:
            lorebook_meta = json.load(f)

        lorebook = []
        for meta_entry in lorebook_meta:
            entry = {k: v for k, v in meta_entry.items()
                     if not k.startswith("_")}

            source_file = meta_entry.get("_source_file", "")
            entry_type = meta_entry.get("_type", "text")

            if source_file:
                content = read_source(project_dir, source_file)

                if entry_type == "css":
                    content = wrap_style(content)

                entry["content"] = content
                print(f"  [OK] lorebook [{meta_entry.get('comment', '?')}] <- {source_file}")
            else:
                entry["content"] = ""

            lorebook.append(entry)

        module["lorebook"] = lorebook
        print(f"  [OK] {len(lorebook)} lorebook entries assembled")

    # ─── 3. backgroundEmbedding CSS ───
    bg_ref = module.get("backgroundEmbedding", "")
    if isinstance(bg_ref, str) and bg_ref.startswith("__SOURCE__:"):
        source_path = bg_ref[len("__SOURCE__:"):]
        css = read_source(project_dir, source_path).rstrip("\n")
        module["backgroundEmbedding"] = wrap_style(css)
        print(f"  [OK] backgroundEmbedding <- {source_path}")

    # ─── 4. dist/module.json 출력 ───
    dist_dir.mkdir(exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(module, f, ensure_ascii=False, indent=2)

    file_size = output_path.stat().st_size
    print(f"\n  [OK] dist/module.json ({file_size:,} bytes)")

    # ─── 5. (선택) .risum 패킹 ───
    if do_pack:
        if not RISUM_TOOL.exists():
            print(f"  [FAIL] risum-tool not found: {RISUM_TOOL}")
        else:
            module_name = module.get("name", "module")
            safe_name = "".join(c for c in module_name if c not in '<>:"/\\|?*')
            output_risum = dist_dir / f"{safe_name}.risum"
            assets_dir = project_dir / "assets"

            cmd = [
                "node", str(RISUM_TOOL),
                "pack", str(output_path), str(output_risum),
            ]
            if assets_dir.exists():
                cmd += ["--assets", str(assets_dir)]

            print(f"\n  Packing: {output_risum.name}")
            result = subprocess.run(cmd, capture_output=True, text=True,
                                    cwd=str(RISUM_TOOL.parent))
            if result.returncode == 0:
                risum_size = output_risum.stat().st_size
                print(f"  [OK] {output_risum.name} ({risum_size:,} bytes)")
            else:
                print(f"  [FAIL] Pack failed: {result.stderr}")

    print("\nBuild complete!")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python build.py <project_dir> [--pack]")
        sys.exit(1)
    proj = Path(sys.argv[1]).resolve()
    do_pack = "--pack" in sys.argv
    print(f"Project: {proj}\n")
    build(proj, do_pack)
