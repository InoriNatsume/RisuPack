# 작업장 구조

이 문서는 사용자가 실제로 수정하는 추출 작업장 구조를 설명합니다.

## 기본 규칙

- 가능하면 작업장은 도구 저장소 밖에 둡니다.
- 사람이 수정하는 기준은 `src/`와 `assets/`입니다.
- `imports/`는 staged 입력 파일 보관용으로만 사용합니다.
- 순서와 매핑 정보는 `src/*.meta.json`에 둡니다.
- `pack/`은 재빌드 보조 데이터로 보고, 주 편집 대상으로 보지 않습니다.
- staged 흐름은 `workspace stage-input` -> `workspace extract` -> `workspace build`입니다.
- extract 과정에서 작업장 `AGENTS.md`와 종류별 skill 하나가 추가될 수 있습니다.
- 같은 파일이 이미 있으면 기존 파일을 유지합니다.

## 작업장 예시

```text
<tool-repo>/       <- 도구 저장소
<workspace-root>/  <- 작업장 루트
  ├─ my-bot\
  ├─ my-module\
  └─ my-preset\
```

## 봇 작업장

```text
my-bot/
├─ AGENTS.md
├─ .agents/
│  └─ skills/
│     └─ risu-bot-workspace/
│        └─ SKILL.md
├─ project.meta.json
├─ imports/
├─ src/
│  ├─ card/
│  └─ module/           # embedded module.risum이 있을 때만 생성
├─ pack/
├─ assets/
└─ dist/
```

## 모듈 작업장

```text
my-module/
├─ AGENTS.md
├─ .agents/
│  └─ skills/
│     └─ risu-module-workspace/
│        └─ SKILL.md
├─ project.meta.json
├─ imports/
├─ src/
│  ├─ lorebook/
│  ├─ lorebook.meta.json
│  ├─ regex/
│  ├─ regex.meta.json
│  ├─ trigger.lua | trigger.json | trigger.unsupported.txt
│  └─ trigger.meta.json
├─ pack/
├─ assets/
└─ dist/
```

## 프리셋 작업장

```text
my-preset/
├─ AGENTS.md
├─ .agents/
│  └─ skills/
│     └─ risu-preset-workspace/
│        └─ SKILL.md
├─ project.meta.json
├─ imports/
├─ src/
│  ├─ prompt-template/
│  ├─ prompt-template.meta.json
│  ├─ regex/
│  └─ regex.meta.json
├─ pack/
└─ dist/
```

## 메타 우선순위

build는 메타데이터를 다음 순서로 해석합니다.

1. `src/*.meta.json`
2. `pack/*.meta.json`
3. 현재 `src/` 스캔 결과

## 포맷별 메모

- 모듈 V1 trigger는 `trigger.unsupported.txt`로 내보내고, build 시 원문 trigger 데이터를 보존합니다.
- 모듈 lorebook folder 엔트리는 Risu 호환을 위해 `content: ""`를 유지합니다.
- build 시 현재 `assets/` 파일이 예전 raw 스냅샷보다 우선합니다.

## Git 권장

기본적으로 추적 권장:

- `project.meta.json`
- `src/**`

기본적으로 비추적 권장:

- `imports/`
- `pack/`
- `assets/`
- `dist/`

새 환경에서 `pack/`이나 `assets/`가 없으면 원본 파일에서 다시 `extract`하는 편이 안전합니다.
build는 누락된 `src/*.meta.json`을 자동 재생성하지 않습니다.
