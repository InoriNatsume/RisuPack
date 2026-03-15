# 모듈 포맷 (.risum)

> **관련 테스트**: `tests/risum.test.ts`, `tests/schema.test.ts` → `Risum Schema Validation`

---

## 1. 개요

`.risum`은 로어북, Regex 스크립트, Trigger 스크립트, 에셋을 패키징하는 RisuAI 모듈 포맷입니다.

---

## 2. 바이너리 구조

```
┌─────────────────────────────────────────────────────────────────┐
│ 헤더                                                            │
├─────────┬─────────┬─────────────┬──────────────────────────────┤
│ Magic   │ Version │ Main Length │ Main Data (RPack)            │
│ 1 byte  │ 1 byte  │ 4 bytes LE  │ variable                     │
│ 0x6F    │ 0x00    │             │ → JSON {type, module}        │
├─────────┴─────────┴─────────────┴──────────────────────────────┤
│ 에셋 블록 (반복)                                                 │
├─────────┬─────────────┬────────────────────────────────────────┤
│ Marker  │ Asset Length│ Asset Data (RPack)                     │
│ 1 byte  │ 4 bytes LE  │ variable                               │
│ 0x01    │             │ → 바이너리                             │
└─────────┴─────────────┴────────────────────────────────────────┘
│ EOF 마커: 0x00                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 매직 넘버

- **0x6F 0x00**: risum 포맷 v0

### 2.2 RPack 인코딩

> ⚠️ **중요**: WASM 사용 필수! 단순 룩업 테이블 구현은 일부 파일에서 실패.

RPack은 RisuAI 커스텀 바이트 매핑 코덱입니다.

```typescript
// WASM 모듈 사용
import { decode, encode } from "../rpack/rpack";

const decodedData = await decode(rpackEncodedData);
```

---

## 3. 메인 블록 JSON 구조

```typescript
interface RisumMainBlock {
  type: "risuModule";
  module: RisuModule;
}
```

---

## 4. RisuModule 스키마

```typescript
interface RisuModule {
  // ═══════════════════════════════════════════════════════════════
  // 기본 정보
  // ═══════════════════════════════════════════════════════════════
  name: string; // 모듈 이름
  description: string; // 모듈 설명
  id: string; // UUID
  namespace?: string; // 네임스페이스 (충돌 방지)

  // ═══════════════════════════════════════════════════════════════
  // 컨텐츠
  // ═══════════════════════════════════════════════════════════════
  lorebook?: LoreBookEntry[]; // 로어북 엔트리 배열
  regex?: CustomScript[]; // Regex 스크립트 배열
  trigger?: TriggerScript[]; // Trigger 스크립트 배열
  cjs?: string; // CustomJS 코드

  // ═══════════════════════════════════════════════════════════════
  // 에셋
  // ═══════════════════════════════════════════════════════════════
  assets?: [string, string, string][]; // [이름, 경로(unused), 확장자]

  // ═══════════════════════════════════════════════════════════════
  // 옵션
  // ═══════════════════════════════════════════════════════════════
  lowLevelAccess?: boolean; // 저수준 접근 권한
  hideIcon?: boolean; // 아이콘 숨김
  backgroundEmbedding?: string; // 배경 임베딩
  customModuleToggle?: string; // 커스텀 모듈 토글

  // ═══════════════════════════════════════════════════════════════
  // MCP 서버
  // ═══════════════════════════════════════════════════════════════
  mcp?: {
    url: string;
  };
}
```

---

## 5. 컨텐츠 스키마

### 5.1 LoreBookEntry (로어북)

```typescript
interface LoreBookEntry {
  // 트리거
  key: string; // 기본 키워드 (쉼표 구분)
  secondkey: string; // 보조 키워드
  selective: boolean; // 보조 키 필요 여부

  // 컨텐츠
  comment: string; // 표시 이름
  content: string; // 실제 내용

  // 설정
  insertorder: number; // 삽입 순서
  mode: "normal" | "constant" | "folder" | "multiple" | "child";
  alwaysActive: boolean; // 항상 활성화

  // 고급
  activationPercent?: number; // 활성화 확률 (0-100)
  useRegex?: boolean; // 정규식 사용
  id?: string; // 엔트리 ID
  folder?: string; // 폴더 ID ⚠️ 특수 형식!
}
```

> **⚠️ 폴더 ID 형식**: [gotchas.md](gotchas.md#폴더-id-형식)에서 상세 확인

### 5.2 CustomScript (Regex)

```typescript
interface CustomScript {
  comment: string; // 스크립트 이름
  type: RegexType; // 타입 (아래 참조)
  in: string; // 정규식 패턴
  out: string; // 치환 문자열
  flag?: string; // 정규식 플래그 (기본: 'g')
  ableFlag?: boolean; // 플래그 활성화 여부
}

type RegexType =
  | "editinput" // 입력 편집
  | "editoutput" // 출력 편집
  | "editprocess" // 처리 편집
  | "editdisplay" // 표시 편집
  | "edittrans"; // 번역 편집
```

### 5.3 TriggerScript (Trigger)

```typescript
interface TriggerScript {
  name?: string; // 스크립트 이름
  type: TriggerType; // 트리거 타입
  conditions: TriggerCondition[]; // 조건 배열
  effect: TriggerEffect[]; // 효과 배열
}

type TriggerType =
  | "start" // 채팅 시작
  | "manual" // 수동 트리거
  | "output" // 출력 후
  | "input" // 입력 전
  | "none"; // 없음
```

---

## 6. 에셋 매핑

에셋은 `module.assets` 배열과 바이너리 블록이 **순서로** 매핑됩니다.

```typescript
// module.assets 예시
[
  ["background", "", "png"], // → 에셋 블록 #0
  ["bgm", "", "mp3"] // → 에셋 블록 #1
];
```

### 6.1 에셋 경로 참조

로어북/Regex/Trigger에서 에셋을 참조할 때:

```
{{asset::에셋이름}}
```

---

## 7. 파싱 흐름

```typescript
async function parseRisum(data: Uint8Array): Promise<RisumResult> {
  const reader = new BinaryReader(data.buffer);

  // 1. 매직 넘버 확인
  const magic = reader.readByte();
  const version = reader.readByte();
  if (magic !== 0x6f || version !== 0x00) {
    throw new Error("Invalid risum format");
  }

  // 2. 메인 블록 읽기
  const mainLength = reader.readUint32LE();
  const mainData = reader.readBytes(mainLength);
  const decoded = await decodeRPack(mainData);
  const mainBlock = JSON.parse(new TextDecoder().decode(decoded));

  // 3. 에셋 블록들 읽기
  const assets: Uint8Array[] = [];
  while (!reader.eof()) {
    const marker = reader.readByte();
    if (marker === 0x00) break; // EOF
    if (marker !== 0x01) throw new Error("Invalid asset marker");

    const length = reader.readUint32LE();
    const assetData = reader.readBytes(length);
    assets.push(await decodeRPack(assetData));
  }

  return {
    type: mainBlock.type,
    module: mainBlock.module,
    assets
  };
}
```

---

## 8. 관련 테스트

```typescript
// tests/risum.test.ts
describe("Risum Parser", () => {
  it("should export and parse module roundtrip");
  it("should parse file with correct magic bytes");
  it("should handle module with assets");
  it("should handle empty arrays");
  it("should throw on invalid magic bytes");
});

// tests/schema.test.ts
describe("Risum Schema Validation", () => {
  it("should have valid module structure");
  it("should have lorebook as array");
  it("should have regex as array with correct structure");
  it("should have trigger as array with correct structure");
  it("should have assets as array of Uint8Array");
});
```

---

## 참조

- [gotchas.md](gotchas.md) - 파싱 함정 및 해결책
- [charx.md](charx.md) - 캐릭터 카드 포맷
- [risup.md](risup.md) - 프리셋 포맷
