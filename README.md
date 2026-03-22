# risu-workspace-tools

RisuAI의 봇, 모듈, 프리셋 파일을 작업 폴더로 `extract`하고 다시 원본 포맷으로 `build`하는 TypeScript CLI입니다.

지원 포맷:

- 봇: `.charx`, `.png`, `.jpg`, `.jpeg`
- 모듈: `.risum`
- 프리셋: `.risup`, `.risupreset`

## 빠른 시작

Windows PowerShell 기준입니다.

```powershell
npm install
npm run build
node dist\cli\main.js --help
```

## 명령

```powershell
# extract
risu-workspace-tools extract path\to\bot.charx path\to\workspaces\bot
risu-workspace-tools extract path\to\module.risum path\to\workspaces\module
risu-workspace-tools extract path\to\preset.risup path\to\workspaces\preset

# build
risu-workspace-tools build path\to\workspaces\bot
risu-workspace-tools build path\to\workspaces\module
risu-workspace-tools build path\to\workspaces\preset

# workspace staged input flow
risu-workspace-tools workspace stage-input path\to\bot.charx path\to\workspaces\bot
risu-workspace-tools workspace extract path\to\workspaces\bot
risu-workspace-tools workspace build path\to\workspaces\bot

# inspect
risu-workspace-tools inspect path\to\module.risum

# interactive
npm run interactive
```

`extract`와 `build`는 `--json`을 지원합니다.
`extract`와 `inspect`는 500MB 이상 입력 파일에서 확인을 요구하며, 비대화형 환경에서는 `--yes-large-input`으로 승인할 수 있습니다.
`workspace stage-input`도 같은 대용량 입력 확인 정책을 사용합니다.

## 작업 폴더 원칙

- 사람이 수정하는 기준은 `src/`와 `assets/`입니다.
- 본문 외 순서/매핑 정보는 `src/*.meta.json`이 우선합니다.
- `pack/`은 빌드에 필요한 최소 메타와 보존 데이터입니다.
- `pack/`은 직접 수정하지 않는 쪽을 기본으로 잡습니다.
- `pack/*.meta.json`은 fallback이고, build는 이를 읽기만 하며 누락된 `src/*.meta.json`을 자동 재생성하지 않습니다.
- 입력 파일은 확장자뿐 아니라 실제 컨테이너/헤더도 확인합니다. `.charx`는 ZIP형과 JPEG+ZIP만 허용합니다.
- `workspace extract`는 `imports/`의 입력 파일을 풀고, 작업장용 `AGENTS.md`와 종류별 skill도 함께 배치합니다.
- 작업장용 `AGENTS.md`와 skill은 번들 zip 자산에서 풀리며, 이미 같은 파일이 있으면 그대로 둡니다.

꼭 기억할 예외:

- 모듈 V1 trigger는 source 편집을 지원하지 않고 원문 보존만 합니다.
- 에셋 파일명을 바꿔도 build는 현재 `assets/` 내용을 사용하면서 원래 식별자를 최대한 유지합니다.

## 저장소 구조

```text
RisuCMP/
├─ src/
│  ├─ app/
│  ├─ cli/
│  ├─ core/
│  ├─ formats/
│  └─ types/
├─ docs/
├─ templates/
├─ tests/
├─ vendor/
├─ workspace/
└─ test-artifacts/
```

## 검증

```powershell
npm run check
npm test
npm run test:manifest   # sample manifest가 있을 때만
npm run format
```

`npm test`는 synthetic roundtrip, 경로 탈출 방지, source 누락 거부, 작업장 staged input 흐름을 검증합니다.
실샘플 roundtrip 검증은 `workspace/samples/roundtrip-manifest.json`이 있을 때 `npm run test:manifest`로 별도 실행합니다.

## 문서

- 포맷 문서 검증 기준 RisuAI 버전: `Risuai-2026.2.291`
- [프로젝트 구조](docs/project-structure.md)
- [작업장 구조](docs/workspace-structure.md)
- [포맷 메모](docs/format/)

## 크레딧

- 모듈툴: [arca.live 글](https://arca.live/b/characterai/163439328): 사실상 프로젝트의 동기이자 기준점, 모듈 처리 방식 상당수.
- 로어툴: [arca.live 글](https://arca.live/b/characterai/163452507)
- RisuToki (original): [komodoD/RisuToki](https://github.com/komodoD/RisuToki): 봇 편집 단위.
- RisuToki (fork version) [woduseh/RisuToki](https://github.com/woduseh/RisuToki): 파일 포맷 재조합, 프리뷰/프롬프트 관련 구현 참조, SKILL 문서.
- RisuAI: [kwaroran/RisuAI](https://github.com/kwaroran/RisuAI)
