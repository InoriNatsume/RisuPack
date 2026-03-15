# 프리셋 포맷 (.risup, .risupreset)

> **관련 테스트**: `tests/crypto.test.ts`

---

## 1. 개요

| 확장자        | 구조                                         |   암호화    |
| ------------- | -------------------------------------------- | :---------: |
| `.risup`      | RPack → fflate → MsgPack → AES-GCM → MsgPack |     ✅      |
| `.risupreset` | fflate → MsgPack → AES-GCM → MsgPack         | ✅ (레거시) |

---

## 2. 파싱 체인

### 2.1 .risup (최신)

```
읽기: RPack 디코딩 → Deflate 해제 → MsgPack 디코딩
      → AES-GCM 복호화 → MsgPack 디코딩 → botPreset

쓰기: botPreset → MsgPack → AES-GCM 암호화
      → MsgPack + 메타 → Deflate → RPack → 파일
```

### 2.2 .risupreset (레거시)

```
읽기: Deflate 해제 → MsgPack 디코딩
      → AES-GCM 복호화 → MsgPack 디코딩 → botPreset
```

---

## 3. AES-GCM 암호화

### 3.1 파라미터

| 항목         | 값                                |
| ------------ | --------------------------------- |
| **알고리즘** | AES-256-GCM                       |
| **키**       | `SHA-256("risupreset")` (256비트) |
| **IV**       | 12바이트 zeros                    |
| **AuthTag**  | 16바이트 (데이터 끝에 위치)       |

### 3.2 복호화 코드

```typescript
import * as crypto from "crypto";

async function decryptPreset(data: Uint8Array): Promise<Buffer> {
  const keyHash = crypto.createHash("sha256").update("risupreset").digest();
  const iv = Buffer.alloc(12, 0); // 12바이트 zeros

  const authTag = data.slice(-16); // 마지막 16바이트
  const ciphertext = data.slice(0, -16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", keyHash, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
```

---

## 4. botPreset 스키마

### 4.1 기본 필드

```typescript
interface botPreset {
  name?: string; // 프리셋 이름
  image?: string; // 이미지 (Base64)
  apiType?: string; // API 타입
  aiModel?: string; // AI 모델명
}
```

### 4.2 모델 파라미터

```typescript
interface botPreset {
  temperature: number; // 온도 (0-200, 실제값 = /100)
  maxContext: number; // 최대 컨텍스트 토큰
  maxResponse: number; // 최대 응답 토큰
  frequencyPenalty: number; // 빈도 패널티
  PresensePenalty: number; // 존재 패널티 ⚠️ 오타 주의!
  top_p?: number; // Top P
  top_k?: number; // Top K
}
```

> **⚠️ 주의**: `PresensePenalty`는 오타지만 실제 필드명입니다.

### 4.3 프롬프트 필드

```typescript
interface botPreset {
  // 레거시 (promptTemplate 없을 때)
  mainPrompt: string;
  jailbreak: string;
  globalNote: string;

  // 최신 (구조화된 배열)
  promptTemplate?: PromptItem[];
  formatingOrder: FormatingOrderItem[];
}
```

### 4.4 Regex 스크립트

```typescript
interface botPreset {
  regex?: RegexScript[];
}

interface RegexScript {
  comment: string; // 이름
  type: "editinput" | "editoutput" | "editdisplay" | "edittrans";
  in: string; // 정규식 패턴
  out: string; // 치환 문자열
  flag?: string; // 플래그 (기본: 'g')
}
```

---

## 5. PromptItem 타입

`promptTemplate` 배열의 각 항목입니다.

### 5.1 타입 종류

```typescript
type PromptItem =
  | PromptItemPlain // 일반 텍스트
  | PromptItemTyped // 타입 기반 (persona, description 등)
  | PromptItemChat // 채팅 기록
  | PromptItemAuthorNote // 작성자 노트
  | PromptItemChatML // ChatML 형식
  | PromptItemCache; // 캐시 포인트
```

### 5.2 PromptItemPlain

```typescript
interface PromptItemPlain {
  type: "plain" | "jailbreak" | "cot";
  type2: "normal" | "globalNote" | "main";
  text: string;
  role: "user" | "bot" | "system";
  name?: string;
}
```

### 5.3 PromptItemTyped

```typescript
interface PromptItemTyped {
  type: "persona" | "description" | "lorebook" | "postEverything" | "memory";
  innerFormat?: string; // 예: "{{slot}}"
  name?: string;
}
```

### 5.4 PromptItemChat

```typescript
interface PromptItemChat {
  type: "chat";
  rangeStart: number;
  rangeEnd: number | "end";
  name?: string;
}
```

---

## 6. FormatingOrderItem

프롬프트 조합 순서:

```typescript
type FormatingOrderItem =
  | "main" // 메인 프롬프트
  | "jailbreak" // Jailbreak
  | "chats" // 채팅 기록
  | "lorebook" // 로어북
  | "globalNote" // 글로벌 노트
  | "authorNote" // 작성자 노트
  | "lastChat" // 마지막 채팅
  | "description" // 캐릭터 설명
  | "postEverything" // 모든 것 뒤
  | "personaPrompt"; // 페르소나
```

---

## 7. mainPrompt vs promptTemplate

| 필드                      | 사용 시기                             |
| ------------------------- | ------------------------------------- |
| `mainPrompt`, `jailbreak` | `promptTemplate`가 없는 레거시 프리셋 |
| `promptTemplate`          | 최신 프리셋 (2024+)                   |

```typescript
// RisuAI 동작
if (preset.promptTemplate?.length > 0) {
  // 최신 방식
  processPromptTemplate(preset.promptTemplate);
} else {
  // 레거시 방식
  processLegacy(preset.mainPrompt, preset.jailbreak);
}
```

---

## 8. 관련 테스트

```typescript
// tests/crypto.test.ts
describe("AES-GCM Encryption", () => {
  it("should decrypt preset with correct key");
  it("should encrypt and decrypt roundtrip");
});
```

---

## 참조

- [charx.md](charx.md) - 캐릭터 카드 포맷
- [risum.md](risum.md) - 모듈 포맷
- 원본: `RisuAI/src/ts/storage/database.svelte.ts`
