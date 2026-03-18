# risu-workspace-tools

RisuAI의 봇, 모듈, 프리셋 파일을 작업 폴더로 파싱하고 다시 원본 포맷으로 재조립하는 TypeScript CLI입니다.

현재 작업장 기준:

- 편집 기준은 `src/` + `assets/`
- `pack/`은 포맷 식별, 컨테이너 재작성, unsupported 원문 보존 같은 최소 build 메타
- build는 가능한 한 현재 작업장 파일을 다시 스캔해 재구성

지원 포맷:

- 봇: `.charx`, `.png`, `.jpg`, `.jpeg`
- 모듈: `.risum`
- 프리셋: `.risup`, `.risupreset`

## 사용법

Windows PowerShell 기준입니다.

설치와 빌드:

```powershell
npm install
npm run build
```

직접 실행:

```powershell
node dist\cli\main.js --help
```

로컬 bin 연결:

```powershell
npm link
risu-workspace-tools --help
```

추출:

```powershell
risu-workspace-tools extract path\to\bot.charx workspace\runs\bot
risu-workspace-tools extract path\to\module.risum workspace\runs\module
risu-workspace-tools extract path\to\preset.risup workspace\runs\preset
```

재조립:

```powershell
risu-workspace-tools build workspace\runs\bot
risu-workspace-tools build workspace\runs\module
risu-workspace-tools build workspace\runs\preset
```

출력 파일 직접 지정:

```powershell
risu-workspace-tools build workspace\runs\bot workspace\runs\bot-out.charx
```

메타데이터 확인:

```powershell
risu-workspace-tools inspect path\to\bot.charx
risu-workspace-tools inspect path\to\module.risum
risu-workspace-tools inspect path\to\preset.risup
```

## 폴더 구조

저장소 루트:

```text
RisuCMP/
├─ src/                 # CLI와 포맷 처리 코드
├─ docs/                # 설계와 구조 문서
├─ vendor/              # vendored risum/rpack 코덱
├─ workspace/
│  ├─ samples/          # 샘플 입력 파일
│  ├─ runs/             # 실제 작업용 추출 결과
│  └─ scratch/          # 임시 작업 폴더
├─ test-artifacts/      # 테스트 산출물
```

봇 작업 폴더:

```text
my-bot/
├─ project.meta.json
├─ src/
│  ├─ card/
│  └─ module/           # embedded module.risum이 있을 때 생성
├─ pack/
├─ assets/
└─ dist/
```

모듈 작업 폴더:

```text
my-module/
├─ project.meta.json
├─ src/
├─ pack/
├─ assets/
└─ dist/
```

프리셋 작업 폴더:

```text
my-preset/
├─ project.meta.json
├─ src/
│  ├─ prompt-template/
│  └─ regex/
├─ pack/
└─ dist/
```

핵심 규칙:

- `src/`는 사람이 편집하는 텍스트 source
- `assets/`는 현재 build에 들어갈 실제 바이너리 파일
- `pack/`은 직접 편집 대상이 아니라 build 보조 메타
- 에셋 이름을 바꾸거나 파일을 교체해도 build는 현재 `assets/` 상태를 우선 사용
- 봇 카드는 `pack/card/card.meta.json`의 preserved base와 `src/card/*`를 합쳐 build한다

## 테스트

자동 roundtrip 테스트:

```powershell
npm test
```

타입 체크:

```powershell
npm run check
```

포맷 정리:

```powershell
npm run format
```

`npm test`는 기본적으로 synthetic/security 케이스를 검증하고,
`workspace\samples\roundtrip-manifest.json`이 있으면 샘플 roundtrip도 추가로 검증합니다.

```text
extract -> build -> re-extract
```

기본 검증에는 synthetic `risum`/`risupreset` roundtrip, 경로 탈출 방지, source 누락 거부 등이 포함됩니다.

최근 synthetic 검증에는 아래 정책도 포함됩니다.

- 프리셋 `src/prompt-template`, `src/regex` 스캔 우선
- 모듈 `src/lorebook`, `src/regex` 스캔 우선
- 봇 카드 build 시 `card.raw.json` 비우기/변조 무시
- ZIP/PNG/모듈 에셋 build 시 현재 `assets/` 파일 우선

## 문서

- [프로젝트 구조](docs/project-structure.md)
- [작업장 구조안](docs/workspace-structure.md)
- [pack 리팩터링 계획](docs/pack-refactor-plan.md)
- [포맷 메모](docs/format/)

## 크레딧

- 모듈툴: [arca.live 글](https://arca.live/b/characterai/163439328): 사실상 프로젝트의 동기이자 지향점. 모듈 처리 방식 상당수.
- 로어툴: [arca.live 글](https://arca.live/b/characterai/163452507)
- RisuToki: [komodoD/RisuToki](https://github.com/komodoD/RisuToki): 봇에서의 편집 대상
- RisuAI: [kwaroran/RisuAI](https://github.com/kwaroran/RisuAI)
