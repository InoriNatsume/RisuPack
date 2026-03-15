# module-vcs

RisuAI 모듈의 소스 분리 및 빌드 시스템.

монол리식 `module.json`을 Lua, CSS, Markdown 소스 파일로 분해하여 Git 버전관리와 에디터 지원을 가능하게 합니다.

## 왜 필요한가?

RisuAI 모듈은 단일 `module.json`에 모든 코드, CSS, 프롬프트가 JSON 문자열로 압축되어 있어:
- **Git diff가 무의미** — 77K Lua가 한 줄 JSON 문자열이라 변경 추적 불가
- **에디터 지원 없음** — Lua 구문 강조, CSS linting 불가
- **협업 불가** — 여러 사람이 동시에 같은 JSON 편집 → 충돌 필연

## Quick Start

```bash
# 1. 역추출 (1회)
python path/to/skills/module-vcs/extract.py ./my-module module.json

# 2. src/ 파일 편집 (Lua, CSS, MD를 에디터에서 직접)

# 3. 빌드
python path/to/skills/module-vcs/build.py ./my-module

# 4. 결과
#    → ./my-module/dist/module.json

# 5. 패킹 (.risum)
python path/to/skills/module-vcs/build.py ./my-module --pack
```

## 프로젝트 구조 (extract 후)

```
my-module/
├── src/
│   ├── trigger.lua          ← 트리거 Lua 코드
│   ├── styles/
│   │   ├── *.css            ← CSS 로어북 (자동 <style> 래핑)
│   │   └── embedding.css    ← backgroundEmbedding
│   └── lorebook/
│       ├── _meta.json       ← 로어북 순서/메타
│       ├── *.lua            ← Lua 로어북
│       └── *.md             ← 텍스트/프롬프트 로어북
├── assets/                  ← 에셋 (webp 등)
├── module.meta.json         ← 모듈 메타 (name, toggles, regex 등)
├── dist/                    ← 빌드 산출물
│   └── module.json
└── .gitignore
```

## 워크플로우

```
module.json ──extract──▶ src/ + module.meta.json
                              │
                         편집 (IDE)
                              │
                         ◀──build── dist/module.json
```

- **extract는 1회성** — 이후에는 src/ 파일만 편집
- **build 출력은 항상 `dist/`** — 작업 디렉토리 파일을 덮어쓰지 않음
- **module.meta.json** — 로어북 content를 제외한 모든 메타 정보 (name, id, toggles, regex, trigger 구조)
- **`_meta.json`** — 로어북 순서와 메타를 보존, `_source_file`로 소스 매핑

## 로어북 타입 자동 감지

| 조건 | 타입 | 확장자 |
|---|---|---|
| comment가 `.CSS`로 끝남 또는 `<style>` 래핑 | CSS | `.css` |
| content가 `local `, `function ` 등으로 시작 | Lua | `.lua` |
| 그 외 | 텍스트 | `.md` |

## 요구사항

- Python 3.8+
- Node.js 18+ (`.risum` 패킹 시에만 필요)
