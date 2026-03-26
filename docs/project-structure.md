# 프로젝트 구조

이 문서는 저장소 내부 코드 구조를 설명합니다. 추출된 작업장 구조는 다루지 않습니다.

## 진입점

- `src/cli/main.ts`는 인자 기반 CLI를 실행합니다.
- `src/cli/interactive.ts`는 대화형 CLI를 실행합니다.
- 두 진입점은 모두 `src/app/commands.ts`를 호출합니다.

## 상위 구조

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
│  ├─ input-validation.ts
│  ├─ inspect.ts
│  ├─ json-files.ts
│  ├─ object-utils.ts
│  ├─ path-utils.ts
│  ├─ project-meta.ts
│  ├─ project-paths.ts
│  ├─ routing.ts
│  ├─ source-meta.ts
│  ├─ source-refs.ts
│  ├─ version.ts
│  ├─ workspace-files.ts
│  └─ workspace-naming.ts
├─ formats/
│  ├─ bot/
│  ├─ rpack.ts
│  ├─ risum/
│  └─ risup/
└─ types/
```

## 책임 구분

- `src/app/`은 공통 명령 흐름과 출력 형태를 맡습니다.
- `src/cli/`는 CLI 입력 해석과 콘솔 전용 보조 처리를 맡습니다.
- `src/core/`는 포맷 감지, 입력 검증, 안전한 경로 처리, 작업장 보조 기능, 공통 메타 규칙을 맡습니다.
- `src/formats/rpack.ts`는 `.risum`, `.risup`이 함께 쓰는 저장소 내부 RPack 코덱입니다.
- `src/formats/bot/`은 봇 컨테이너와 editable source 처리를 맡습니다.
- `src/formats/risum/`은 모듈 컨테이너와 lorebook, regex, trigger source 처리를 맡습니다.
- `src/formats/risup/`은 프리셋 컨테이너와 prompt-template, regex source 처리를 맡습니다.
- `src/types/`는 공통 TypeScript 타입을 모읍니다.

## 설계 메모

- `rpack`과 다른 컨테이너 코덱은 `src/formats/` 아래의 저장소 로컬 TypeScript 구현으로 유지합니다.
- 입력 검증과 path traversal 방지는 포맷마다 다르게 흔들리지 않도록 유지합니다.
