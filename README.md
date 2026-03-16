# risu-workspace-tools

RisuAI의 봇, 모듈, 프리셋 파일을 작업 폴더로 파싱하고 다시 원본 포맷으로 재조립하는 TypeScript CLI입니다.

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
├─ workspace/
│  ├─ samples/          # 샘플 입력 파일
│  ├─ runs/             # 실제 작업용 추출 결과
│  └─ scratch/          # 임시 작업 폴더
├─ test-artifacts/      # 테스트 산출물
└─ third_party/         # 외부 복사본/코덱
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

`npm test`는 대표 샘플에 대해 아래 흐름을 검증합니다.

```text
extract -> build -> re-extract
```

현재 검증 대상:

- `risum`
- `risup`
- `charx`
- `jpg/jpeg`
- `png`

## 문서

- [프로젝트 구조](docs/project-structure.md)
- [포맷 메모](docs/format/)

## 크레딧

- RisuToki: [komodoD/RisuToki](https://github.com/komodoD/RisuToki)
- 모듈툴: [arca.live 글](https://arca.live/b/characterai/163439328)
- 로어툴: [arca.live 글](https://arca.live/b/characterai/163452507)
- RisuAI: [kwaroran/RisuAI](https://github.com/kwaroran/RisuAI)
