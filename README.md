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
risu-workspace-tools extract C:\input\bot.charx C:\work\bot
risu-workspace-tools extract C:\input\module.risum C:\work\module
risu-workspace-tools extract C:\input\preset.risup C:\work\preset

# build
risu-workspace-tools build C:\work\bot
risu-workspace-tools build C:\work\module
risu-workspace-tools build C:\work\preset

# inspect
risu-workspace-tools inspect C:\input\module.risum

# interactive
npm run interactive
```

`extract`와 `build`는 `--json`을 지원합니다.

## MCP

MCP 서버는 stdio로 실행합니다.

```powershell
npm run mcp -- --allow-root C:\Users\<user>\RisuWorkspaces --allow-root C:\input
```

- MCP는 최소 한 개의 `--allow-root` 또는 `RISU_MCP_ALLOWED_ROOTS`가 필요합니다.
- 허용 루트 밖 경로는 거부됩니다.
- 응답 경로는 `<allowed-root>/...` 형태로 마스킹됩니다.

자세한 내용은 [docs/mcp.md](./docs/mcp.md)를 봐주세요.

## 작업 폴더 원칙

- 사람이 수정하는 기준은 `src/`와 `assets/`입니다.
- 본문 외 순서/매핑 정보는 `src/*.meta.json`이 우선합니다.
- `pack/`은 빌드에 필요한 최소 메타와 보존 데이터입니다.
- `pack/`은 직접 수정하지 않는 쪽을 기본으로 잡습니다.
- `pack/*.meta.json`은 fallback이고, 없으면 현재 `src/` 스캔 결과로 복원합니다.

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
│  ├─ mcp/
│  └─ types/
├─ docs/
├─ tests/
├─ vendor/
├─ workspace/
└─ test-artifacts/
```

## 검증

```powershell
npm run check
npm test
npm run format
```

`npm test`는 synthetic roundtrip, 경로 탈출 방지, source 누락 거부, MCP 허용 루트 정책을 검증합니다.

## 문서

- [프로젝트 구조](docs/project-structure.md)
- [작업장 구조](docs/workspace-structure.md)
- [MCP](docs/mcp.md)
- [포맷 메모](docs/format/)
