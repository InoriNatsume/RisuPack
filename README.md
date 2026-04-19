# risu-workspace-tools

`risu-workspace-tools`는 RisuAI의 봇, 모듈, 프리셋 파일을 수정 가능한 작업장으로 `extract`한 뒤, 다시 원본 포맷으로 `build`하는 TypeScript CLI입니다.

## 지원 포맷

- 봇: `.charx`, `.png`, `.jpg`, `.jpeg`
- 모듈: `.risum`
- 프리셋: `.risup`, `.risupreset`

## 빠른 시작

```cmd
npm install
npm run build
node dist\cli\main.js --help
```

## 자주 쓰는 명령

```cmd
risu-workspace-tools extract path\to\input path\to\workspace
risu-workspace-tools build path\to\workspace
risu-workspace-tools workspace stage-input path\to\input path\to\workspace
risu-workspace-tools workspace extract path\to\workspace
risu-workspace-tools workspace build path\to\workspace
risu-workspace-tools inspect path\to\input
npm run interactive
```

- `extract`와 `build`는 `--json`을 지원합니다.
- `extract`, `inspect`, `workspace stage-input`은 500MB보다 큰 파일에서 확인을 요구합니다. 비대화형 실행에서는 `--yes-large-input`을 사용합니다.

## 편집 원칙

- 사람이 수정하는 기준은 `src/`와 `assets/`입니다.
- `pack/`은 주 편집 대상이 아니라 fallback 메타데이터로 봅니다.
- 폴더 구조와 포맷별 예외는 [작업장 구조](docs/workspace-structure.md)에서 확인합니다.

## 검증

```cmd
npm run check
npm test
npm run test:manifest
npm run format
```

## 문서

- 포맷 문서 기준 버전: `RisuAI 2026.4.180`
- [프로젝트 구조](docs/project-structure.md)
- [작업장 구조](docs/workspace-structure.md)
- [포맷 메모](docs/format/)

## 크레딧

- 모듈 툴: [arca.live 글](https://arca.live/b/characterai/163439328)
- 로어 툴: [arca.live 글](https://arca.live/b/characterai/163452507)
- RisuToki 원본: [komodoD/RisuToki](https://github.com/komodoD/RisuToki)
- RisuToki 포크: [woduseh/RisuToki](https://github.com/woduseh/RisuToki)
- RisuAI: [kwaroran/RisuAI](https://github.com/kwaroran/RisuAI)

## 테스트 샘플 출처

- 확인 날짜: `2026-03-27`
- `tests/samples-local/🌌 얼터네이트 헌터즈 V2 추가 에셋 모듈.risum`
  - 작성자: `MiliM`
  - 출처: [arca.live/b/characterai/154237746](https://arca.live/b/characterai/154237746), [arca.live/b/characterai/164581980](https://arca.live/b/characterai/164581980)
  - 라이선스: `CC BY-NC 4.0`
- `tests/samples-local/Alternate Hunters V2.charx`
  - 작성자: `MiliM`
  - 출처: [arca.live/b/characterai/154237746](https://arca.live/b/characterai/154237746), [arca.live/b/characterai/164581980](https://arca.live/b/characterai/164581980)
  - 라이선스 참고: [https://arca.live/b/characterai/160596092](https://arca.live/b/characterai/160596092)
- `tests/samples-local/😈소악마 프롬프트 v15A [Gem3.1]_preset.risup`
  - 작성자: `레니허벅지에점있어요`
  - 출처: [arca.live/b/characterai/165492320](https://arca.live/b/characterai/165492320)
  - 라이선스: `CC BY-NC-SA 4.0`
- `Genshin Impact 1.4.png`
  - 작성자: `COSMOS`
  - 출처: [arca.live/b/characterai/160739213](https://arca.live/b/characterai/160739213)
  - 라이선스: 미상
- `tests/samples-local/캠퍼스툰 3.0.jpeg`
  - 작성자: `이삭2`
  - 출처: [arca.live/b/characterai/155896353](https://arca.live/b/characterai/155896353)
  - 라이선스: `CC BY-NC-SA 4.0`
