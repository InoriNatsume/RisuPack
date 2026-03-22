# 작업장 구조

사용자가 실제로 수정하는 작업장 구조입니다.

## 기본 규칙

- 작업장은 저장소 밖 경로를 권장합니다.
- 사람이 수정하는 기준은 `src/`와 `assets/`입니다.
- `src/*.meta.json`은 본문 외 순서/매핑 정보를 담는 editable source 메타입니다.
- `pack/`은 직접 수정 대상이 아니라 빌드 보조 메타입니다.

## 작업장 예시

```text
C:\Dev\RisuCMP\              ← 도구 저장소
C:\Users\<user>\Workspaces\  ← 작업장 루트
  ├─ my-bot\
  ├─ my-module\
  └─ my-preset\
```

## 봇

```text
my-bot/
├─ project.meta.json
├─ src/
│  ├─ card/
│  └─ module/           # embedded module.risum이 있을 때만 생성
├─ pack/
├─ assets/
└─ dist/
```

## 모듈

```text
my-module/
├─ project.meta.json
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

## 프리셋

```text
my-preset/
├─ project.meta.json
├─ src/
│  ├─ prompt-template/
│  ├─ prompt-template.meta.json
│  ├─ regex/
│  └─ regex.meta.json
├─ pack/
└─ dist/
```

## 우선순위

빌드 시 메타 우선순위:

1. `src/*.meta.json`
2. 없으면 `pack/*.meta.json`
3. 둘 다 없으면 현재 `src/` 스캔 결과

## 꼭 남겨야 하는 예외

- 모듈 V1 trigger는 `trigger.unsupported.txt`만 만들고 build 시 원문 trigger를 보존합니다.
- 모듈 lorebook folder 엔트리는 Risu 호환을 위해 build 시 `content: ""`를 유지합니다.
- 현재 `assets/` 파일이 있으면 예전 raw 스냅샷보다 그것을 우선 사용합니다.

## Git 권장

기본적으로 추적 권장 대상:

- `project.meta.json`
- `src/**`

기본적으로 비추적 권장 대상:

- `pack/`
- `assets/`
- `dist/`

새 환경에서 `pack/`이나 `assets/`가 없으면 원본 파일에서 다시 `extract`하는 편이 가장 안전합니다.
