# 프로젝트 구조

현재 구현 기준의 코드 구조 요약입니다.

## 진입점

- `src/cli/main.ts`: 인자형 CLI
- `src/cli/interactive.ts`: 대화형 CLI
- `src/mcp/server.ts`: stdio MCP 서버
- 세 진입점은 모두 `src/app/commands.ts`를 호출합니다.

## 상위 계층

```text
src/
├─ app/
│  ├─ commands.ts
│  └─ presenters.ts
├─ cli/
│  ├─ interactive.ts
│  ├─ main.ts
│  └─ support.ts
├─ core/
│  ├─ asset-reconcile.ts
│  ├─ assets.ts
│  ├─ detect.ts
│  ├─ inspect.ts
│  ├─ project-meta.ts
│  ├─ project-paths.ts
│  ├─ routing.ts
│  ├─ source-meta.ts
│  ├─ source-refs.ts
│  ├─ version.ts
│  └─ workspace-naming.ts
├─ formats/
│  ├─ bot/
│  ├─ risum/
│  └─ risup/
├─ mcp/
│  ├─ access.ts
│  └─ server.ts
└─ types/
```

## 책임 구분

- `app/`: 공통 명령 결과 구조와 출력 포맷
- `cli/`: 사용자 입력과 콘솔 출력
- `mcp/`: MCP 스키마, 허용 루트 정책, 경로 마스킹
- `core/`: 포맷 감지, 라우팅, 경로 안전성, 공용 메타/에셋 규칙
- `formats/bot`: 봇 컨테이너와 editable source 처리
- `formats/risum`: 모듈 컨테이너와 lorebook/regex/trigger source 처리
- `formats/risup`: 프리셋 컨테이너와 prompt-template/regex source 처리

## 빌드 기준

- `src/`와 `assets/`가 실제 build 입력입니다.
- `src/*.meta.json`은 editable source 메타입니다.
- `pack/`은 fallback과 재작성용 최소 메타입니다.
- `pack/` 안의 raw 스냅샷은 참조용일 수 있어도 source of truth는 아닙니다.

## 꼭 남겨야 하는 예외

- 모듈 trigger는 `lua`, `v2`, `unsupported-v1`로 나뉩니다.
- `unsupported-v1`은 source 편집 없이 원문 보존만 지원합니다.
- 에셋은 현재 작업 폴더의 `assets/` 파일을 우선 사용하되, archive path나 chunk key 같은 원래 식별자는 유지하려고 시도합니다.
