# risu-workspace-tools

`risuai-module-tools`가 하던 `extract / build` 흐름을 기준으로,
RisuAI의 봇, 모듈, 프리셋을 작업 폴더로 분해하고 다시 조립하는 CLI입니다.

현재 1차 범위:

- 봇: `.charx`, `.png`, `.jpg`, `.jpeg`
- 모듈: `.risum`
- 프리셋: `.risup`, `.risupreset`

현재 목표는 **기존 도구 수준 유지**입니다.
즉 새로운 편집 기능을 크게 늘리기보다,
기존 워크플로를 다른 포맷에도 쓸 수 있게 하는 데 집중합니다.

## 설치와 실행

기본 전제:

- Windows 기준
- `Node.js` 설치 필요

의존성 설치:

```powershell
npm install
```

빌드:

```powershell
npm run build
```

포맷 정리:

```powershell
npm run format
```

직접 실행:

```powershell
node dist\cli\main.js --help
```

로컬 bin으로 연결해서 실행:

```powershell
npm link
risu-workspace-tools --help
```

## 명령

### extract

원본 파일을 작업 폴더로 분해합니다.

```powershell
risu-workspace-tools extract workspace\samples\test_file\Serena.charx workspace\runs\serena
risu-workspace-tools extract workspace\samples\test_file\벨피라.risum workspace\runs\belpira
risu-workspace-tools extract workspace\samples\test_file\🦋 PSYCHE v1.8.risup workspace\runs\psyche
```

### build

작업 폴더를 다시 원본 포맷 파일로 조립합니다.

```powershell
risu-workspace-tools build workspace\runs\serena
risu-workspace-tools build workspace\runs\belpira
risu-workspace-tools build workspace\runs\psyche
```

출력 파일을 직접 지정할 수도 있습니다.

```powershell
risu-workspace-tools build workspace\runs\serena workspace\runs\serena-out.charx
```

### inspect

입력 파일의 핵심 메타데이터를 JSON으로 출력합니다.

```powershell
risu-workspace-tools inspect workspace\samples\test_file\Serena.charx
risu-workspace-tools inspect workspace\samples\test_file\벨피라.risum
risu-workspace-tools inspect workspace\samples\test_file\🦋 PSYCHE v1.8.risup
```

## 폴더 정리 기준

루트는 실행 가능한 프로젝트 파일만 남기고, 나머지는 아래처럼 분리합니다.

- `references/`
  - 참조용 원본 저장소
- `workspace/samples/`
  - 샘플 입력 파일과 원본 테스트 폴더
- `workspace/runs/`
  - 실제 작업용 추출 결과와 재조합 결과
- `workspace/scratch/`
  - 임시 작업 폴더
- `test-artifacts/`
  - 자동/수동 검증 산출물

## 작업 폴더 예시

### 봇

```text
my-bot/
├─ project.meta.json
├─ src/
│  ├─ card/
│  │  ├─ name.txt
│  │  ├─ description.md
│  │  ├─ first-message.md
│  │  ├─ alternate-greetings/
│  │  │  ├─ 001.md
│  │  │  └─ ...
│  │  ├─ global-note.md
│  │  ├─ default-variables.txt
│  │  └─ styles/
│  │     └─ background.css
│  └─ module/
│     ├─ src/
│     │  ├─ lorebook/
│     │  ├─ regex/
│     │  ├─ trigger.lua | trigger.json | trigger.unsupported.txt
│     │  └─ styles/
│     ├─ pack/
│     └─ assets/
├─ pack/
│  ├─ bot.meta.json
│  ├─ card/
│  │  ├─ card.meta.json
│  │  └─ card.raw.json
│  ├─ x_meta/
│  └─ _preserved/
├─ assets/
└─ dist/
```

현재 직접 편집 대상:

- `src/card/name.txt`
- `src/card/description.md`
- `src/card/first-message.md`
- `src/card/alternate-greetings/*.md`
- `src/card/global-note.md`
- `src/card/default-variables.txt`
- `src/card/styles/background.css`

`.charx` / `jpeg-zip` 봇에 embedded `module.risum`이 있으면
`src/module/` 하위 작업 폴더로 같이 분해합니다.

에셋은 작업 폴더에서 사람이 읽기 좋은 파일명으로 보일 수 있지만,
build 때는 `bot.meta.json` 안의 원래 식별자 기준으로 다시 조립합니다.

봇도 내부적으로는 두 단계로 동작합니다.

1. `container` 단계: 원본 파일 포맷 해제/재조립
2. `source` 단계: 카드 본체와 embedded 모듈을 편집 파일 구조로 분해/조립

### 모듈

```text
my-module/
├─ project.meta.json
├─ src/
│  ├─ lorebook/
│  │  ├─ _root/
│  │  └─ ...
│  ├─ regex/
│  ├─ trigger.lua | trigger.json | trigger.unsupported.txt
│  └─ styles/
├─ pack/
│  ├─ module.json
│  ├─ module.assets.json
│  ├─ module.meta.json
│  ├─ lorebook.meta.json
│  ├─ regex.meta.json
│  ├─ trigger.meta.json
│  └─ dist/
├─ assets/
└─ dist/
```

모듈은 내부적으로:

1. `.risum` unpack
2. source 단계로 소스 분해
3. build 후 `pack/dist/module.json` 생성
4. `.risum` repack

흐름으로 동작합니다.

모듈 로어북은 flat 파일 목록이 아니라 폴더 구조를 유지해서 `src/lorebook/` 아래로 풀어냅니다.
정규식은 `src/regex/*.json`으로 개별 분해합니다.

중요:

- 트리거는 RisuAI 모드 기준으로 분해합니다.
- Lua 모드면 `src/trigger.lua`
- V2 모드면 `src/trigger.json`
- V1이 감지되면 `src/trigger.unsupported.txt`만 만들고 build 때 원본 trigger를 그대로 유지합니다.
- `backgroundEmbedding`은 `src/styles/embedding.css`로 분해합니다.
- 로어북 엔트리는 내용이 Lua/CSS처럼 보여도 기본적으로 `src/lorebook/**/*.md`로 분해합니다.
- 즉 로어북 타입을 내용으로 추측해서 `.lua`나 `.css`로 바꾸지 않습니다.

에셋은 봇과 모듈 모두 같은 원칙을 따릅니다.

- 작업 폴더에는 사람이 읽기 쉬운 표시용 파일명을 씁니다.
- 재조합은 원래 식별자(`sourcePath`, `chunkKey`, `sourceIndex`) 기준으로 합니다.
- 확장자는 메타 문자열보다 바이트 시그니처 판정을 우선합니다.

### 프리셋

```text
my-preset/
├─ project.meta.json
├─ src/
│  ├─ name.txt
│  ├─ main-prompt.md
│  ├─ jailbreak.md
│  ├─ global-note.md
│  ├─ custom-prompt-template-toggle.txt
│  ├─ template-default-variables.txt
│  ├─ prompt-template/
│  │  ├─ 001-*.json
│  │  ├─ 001-*.md
│  │  └─ ...
│  └─ regex/
│     ├─ *.json
│     └─ ...
├─ pack/
│  ├─ preset.raw.json
│  ├─ preset.meta.json
│  ├─ prompt-template.meta.json
│  ├─ regex.meta.json
│  └─ dist/
│     └─ preset.json
└─ dist/
```

프리셋은 내부적으로:

1. `container` 단계에서 `.risup` / `.risupreset`를 해제/재조립
2. `source` 단계에서 주요 텍스트와 `promptTemplate`, `regex`를 편집용 파일로 분해/조립

흐름으로 동작합니다.

현재 1차 editable 범위:

- `src/name.txt`
- `src/main-prompt.md`
- `src/jailbreak.md`
- `src/global-note.md`
- `src/custom-prompt-template-toggle.txt`
- `src/template-default-variables.txt`
- `src/prompt-template/*.json`, `*.md`
- `src/regex/*.json`

## 테스트

자동 roundtrip 스모크 테스트:

```powershell
npm test
```

이 테스트는 대표 샘플들에 대해 아래 흐름을 돌립니다.

```text
extract -> build -> re-extract
```

테스트 산출물은 `workspace/runs/`가 아니라 `test-artifacts/` 아래에 생성됩니다.

현재 검증 대상:

- `risum`
- `risup`
- `charx`
- `jpg/jpeg`
- `png`

참고:

- standalone `.risum`과 `.charx` 안 embedded `module.risum`은 같은 파일이 아닐 수 있습니다.

## 프로젝트 문서

- [설계 방향](docs/design-direction.md)
- [프로젝트 구조](docs/project-structure.md)

## Credits

- RisuToki: [komodoD/RisuToki](https://github.com/komodoD/RisuToki)
- 모듈툴: [arca.live 글](https://arca.live/b/characterai/163439328)
- 로어툴: [arca.live 글](https://arca.live/b/characterai/163452507)
- RisuAI: [kwaroran/RisuAI](https://github.com/kwaroran/RisuAI)
