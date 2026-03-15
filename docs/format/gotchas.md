# 파싱 함정 및 해결책 (Gotchas)

> 🚨 **필독**: 이 문서는 실제 디버깅 과정에서 발견된 함정들입니다.  
> 각 항목은 `tests/schema.test.ts`에서 검증됩니다.

---

## 목차

1. [봇 카드 vs AI 이미지 EXIF 혼동](#봇-카드-vs-ai-이미지-exif-혼동) ⭐⭐ CRITICAL
2. [PNG V2 카드 에셋 누락](#png-v2-카드-에셋-누락) ⭐⭐ NEW
3. [PNG 텍스트 인코딩](#png-텍스트-인코딩) ⭐ NEW
4. [V3 에셋 확장자 버그](#v3-에셋-확장자-버그) ⭐ NEW
5. [PNG/JPEG 확장자 처리 누락](#pngjpeg-확장자-처리-누락) ⭐
6. [x_meta 폴더 처리](#x_meta-폴더-처리)
7. [폴더 ID 형식](#폴더-id-형식) ⭐
8. [에셋 타입 판별](#에셋-타입-판별) ⭐
9. [에셋 URI 형식](#에셋-uri-형식)
10. [Svelte 반응성 의존성](#svelte-반응성-의존성)
11. [RPack WASM 필수](#rpack-wasm-필수)
12. [프리셋 필드 오타](#프리셋-필드-오타)

---

## 봇 카드 vs AI 이미지 EXIF 혼동

> ⚠️ **가장 흔한 실수**: 봇 카드 파싱과 AI 이미지 EXIF 추출을 혼동함

### 두 가지는 완전히 다름!

| 항목          | 봇 카드 파싱                         | AI 이미지 EXIF 추출               |
| ------------- | ------------------------------------ | --------------------------------- |
| **대상 파일** | `.charx`, `.png`, `.jpg` (봇 카드)   | 에셋 폴더 내 이미지               |
| **목적**      | 캐릭터 데이터 추출                   | AI 생성 메타데이터 추출           |
| **PNG 청크**  | `chara`, `ccv3`, `chara-ext-asset_N` | `parameters`, `Comment`, `prompt` |
| **사용 함수** | `parseCharx()`, `parsePng()`         | `extractImageMetadata()`          |
| **출력**      | 로어북, Regex, Trigger, 에셋         | 프롬프트, 모델, 시드 등           |

### 언제 어떤 것을 사용?

```typescript
// 1. 봇 카드 파싱 (사용자가 파일을 드롭할 때)
async function handleFile(file: File) {
  if (fileType === "png") {
    const result = await parsePng(data); // tEXt에서 chara/ccv3 추출
    fileData = transformCharxData(result);
  }
}

// 2. AI 이미지 EXIF (에셋 내 이미지 상세 볼 때)
async function showAssetExif(asset: AssetEntry) {
  const meta = await extractImageMetadata(asset.data); // EXIF/스테가노그래피 추출
  // meta.modelKind === 'nai' | 'comfy' | 'a1111'
}
```

### AI 이미지 메타데이터 소스

| 소스        | 도구          | 추출 방법                                 |
| ----------- | ------------- | ----------------------------------------- |
| **NAI**     | NovelAI       | Alpha 채널 LSB 스테가노그래피             |
| **ComfyUI** | ComfyUI       | PNG `prompt`, `workflow` 청크             |
| **A1111**   | AUTOMATIC1111 | PNG `parameters` 청크 / JPEG EXIF Comment |

### 코드 위치

- 봇 카드 파싱: `src/formats/bot/container-zip.ts`, `src/formats/bot/container-png.ts`
- AI EXIF 추출: `src/lib/core/exif/extractor.ts`

---

## PNG V2 카드 에셋 누락

> **테스트**: `tests/schema.test.ts` → `PNG Character Card Schema Validation`

### 문제

PNG 캐릭터 카드에서 **에셋이 1~2개만 파싱**되고 나머지 200개 이상이 누락됨.

### 원인

V2 카드와 V3 카드의 에셋 저장 위치가 다름:

| 버전 | 에셋 메타데이터 위치                             | 예시                                 |
| ---- | ------------------------------------------------ | ------------------------------------ |
| V3   | `card.data.assets[]`                             | `{ type: 'icon', uri: '__asset:0' }` |
| V2   | `card.data.extensions.risuai.additionalAssets[]` | `['black', '__asset:1', 'black']`    |

**기존 코드**는 V3만 처리하고 V2를 무시함.

### 추가 문제

PNG 파일에는 `chara` (V2)와 `ccv3` (V3) 청크가 **동시에 존재**할 수 있음!

```
PNG 파일 청크:
├── chara          ← V2 JSON (Base64)
├── ccv3           ← V3 JSON (Base64) ← 우선 사용!
├── chara-ext-asset_:0
├── chara-ext-asset_:1
└── ...
```

### 해결책

```typescript
// 1. ccv3가 있으면 우선 사용
if (keyword === "ccv3" || !charaData) {
  charaData = valueBytes;
}

// 2. V3 assets 처리
const assetMeta = card.data.assets;
if (assetMeta?.length > 0) {
  for (const meta of assetMeta) {
    // V3 에셋 처리...
  }
}

// 3. V2 additionalAssets 처리 (V3에 없는 경우)
const risuai = card.data.extensions?.risuai;
const additionalAssets = risuai?.additionalAssets;
if (additionalAssets?.length > 0) {
  for (const [name, uri, fileName] of additionalAssets) {
    // V2 에셋 처리...
  }
}
```

---

## PNG 텍스트 인코딩

> **테스트**: `tests/schema.test.ts` → `should correctly decode UTF-8 text`

### 문제

PNG 카드의 한글 텍스트가 깨져서 표시됨:

- `코를 찌르는 것은...` → `ì½â¬ë¡¤ ì°ì¸ë ê²ì...` (깨짐)

### 원인

PNG tEXt 청크는 **Latin1**로 인코딩되지만, 실제 데이터는 **Base64 → UTF-8 JSON**임.

```
저장 과정:
UTF-8 JSON → Base64 문자열 → Latin1 바이트로 PNG 청크에 저장

읽기 과정 (올바른 방법):
Latin1 디코딩 → Base64 디코딩 → UTF-8 JSON 파싱
```

### 잘못된 코드

```typescript
// ❌ 잘못된 방법
const value = new TextDecoder("latin1").decode(chunkData);
const jsonStr = atob(value); // Latin1 문자열을 atob에 넣음
const card = JSON.parse(jsonStr); // 한글 깨짐!
```

### 해결책

```typescript
// ✅ 올바른 방법
const base64Str = new TextDecoder("latin1").decode(valueBytes);

// atob()는 Latin1 문자열 → 바이너리 변환
const binaryStr = atob(base64Str);
const jsonBytes = new Uint8Array(binaryStr.length);
for (let i = 0; i < binaryStr.length; i++) {
  jsonBytes[i] = binaryStr.charCodeAt(i);
}

// 최종 JSON은 UTF-8로 디코딩
const jsonStr = new TextDecoder("utf-8").decode(jsonBytes);
const card = JSON.parse(jsonStr); // 한글 정상!
```

---

## V3 에셋 확장자 버그

> **테스트**: `tests/schema.test.ts` → `should have assets with proper extension detection`

### 문제

V3 카드의 `asset.ext` 필드에 **잘못된 값**이 저장됨:

```json
{
  "type": "x-risu-asset",
  "name": "fertilization_success",
  "uri": "__asset:2",
  "ext": "fertilization_success" // ❌ 확장자가 아님!
}
```

### 원인

RisuAI 내보내기 버그로 추정. `ext` 필드에 에셋 이름이 들어감.

### 해결책

`ext`가 유효한 확장자가 아니면 **magic bytes로 실제 파일 형식 추정**:

```typescript
const validExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', ...]);

function guessExtension(data: Uint8Array, fallbackExt: string): string {
  // 유효한 확장자면 그대로 사용
  if (validExts.has(fallbackExt.toLowerCase())) {
    return fallbackExt.toLowerCase();
  }

  // Magic bytes로 추정
  if (data[0] === 0x89 && data[1] === 0x50) return 'png';
  if (data[0] === 0xFF && data[1] === 0xD8) return 'jpg';
  if (data[0] === 0x52 && data[1] === 0x49 &&
      data[8] === 0x57 && data[9] === 0x45) return 'webp';
  if (data[0] === 0x47 && data[1] === 0x49) return 'gif';
  // ...

  return 'bin';  // 알 수 없으면 기본값
}
```

---

## x_meta 폴더 처리

### 문제

CharX 파일 내 `x_meta/` 폴더의 JSON 파일들이 에셋으로 표시됨:

```
character.charx (ZIP)
├── card.json
├── assets/
│   └── icon.png         # ✅ 에셋
└── x_meta/              # ❌ 에셋 아님!
    ├── 1.json
    └── 2.json
```

### 해결책

ZIP 파일 처리 시 `x_meta/` 경로 제외:

```typescript
for (const [path, data] of assets) {
  // x_meta 폴더는 RisuAI 내부 메타데이터 - 에셋 아님!
  if (path.startsWith("x_meta/") || path.startsWith("x_meta\\")) continue;

  // 에셋 처리...
}
```

---

## PNG/JPEG 확장자 처리 누락

### 문제

`getFileType()` 함수에서 `.png`, `.jpg`, `.jpeg` 확장자를 처리하지 않았습니다:

```typescript
// ❌ 잘못된 코드 - png/jpeg 누락
function getFileType(name: string): "charx" | "risum" | "risup" | "" {
  switch (ext) {
    case "charx":
      return "charx";
    case "risum":
      return "risum";
    // png, jpg, jpeg 없음!
    default:
      return "";
  }
}
```

### 결과

- `Unsupported file type:` 에러 발생
- 문서에서 PNG/JPEG 지원을 명시해놓고 실제로 구현 안 함

### 해결책

```typescript
// ✅ 수정된 코드
function getFileType(
  name: string
): "charx" | "risum" | "risup" | "png" | "jpeg" | "" {
  switch (ext) {
    case "charx":
      return "charx";
    case "png":
      return "png";
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "risum":
      return "risum";
    case "risup":
    case "risupreset":
      return "risup";
    default:
      return "";
  }
}
```

그리고 `handleFile()`에서 케이스 추가:

```typescript
case 'png':
  const pngResult = await parsePng(data);
  fileData = transformCharxData(pngResult);
  break;
case 'jpeg':
  const jpegResult = await parseJpeg(data);
  fileData = transformCharxData(jpegResult);
  break;
```

### 교훈

**문서 작성 후 반드시 실제 기능 테스트**

---

## 폴더 ID 형식

> **테스트**: `tests/schema.test.ts` → `should parse lorebook entries with folder structure correctly`

### 문제

로어북 엔트리의 `folder` 필드가 단순 UUID가 아닙니다:

```typescript
// ❌ 잘못된 가정
entry.folder === "69913e3e-80d9-4010-8ee1-979a6d7c173a";

// ✅ 실제 데이터
entry.folder === "\uf000folder:69913e3e-80d9-4010-8ee1-979a6d7c173a";
//               ↑ 특수 유니코드 prefix!
```

### 왜 이렇게 되어 있나?

RisuAI 내부에서 폴더 참조를 구분하기 위한 마커입니다:

- `\uf000` (U+F000): 사설 사용 영역 문자
- `folder:`: 폴더 타입 식별자

### 해결책

```typescript
const extractFolderId = (folder: string): string | null => {
  if (!folder) return null;
  const match = folder.match(/folder:(.+)/);
  return match ? match[1] : null;
};

// 사용
const parentId = extractFolderId(entry.folder);
if (parentId && folderMap.has(parentId)) {
  // 폴더에 속함
}
```

### 폴더 엔트리 구조

```typescript
// 폴더 자체
{
  mode: 'folder',
  name: '설정 폴더',           // 또는 comment
  id: '69913e3e-...',          // 폴더 ID
}

// 폴더에 속한 엔트리
{
  mode: 'normal',
  comment: '엔트리 이름',
  folder: '\uf000folder:69913e3e-...',  // 부모 폴더 참조
}
```

---

## 에셋 타입 판별

> **테스트**: `tests/schema.test.ts` → `should have assets with proper extension detection`

### 문제

에셋의 `type` 필드로 이미지 여부를 판별할 수 없습니다:

```typescript
// ❌ 잘못된 코드
const isImage = asset.type === "image"; // 항상 false!

// ✅ 실제 데이터
asset.type === "x-risu-asset"; // 또는 'icon', 'emotion' 등
```

### 왜 이렇게 되어 있나?

`type` 필드는 에셋의 **용도**를 나타내지, 파일 형식을 나타내지 않습니다:

- `icon`: 프로필 아이콘
- `emotion`: 감정 이미지
- `x-risu-asset`: RisuAI 내부 에셋

### 해결책

**확장자로 판별**:

```typescript
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "flac"];
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "avi"]; // ⚠️ webm 포함!

function getAssetMediaType(asset: {
  ext?: string;
  name?: string;
}): "image" | "audio" | "video" | "other" {
  const ext = (asset.ext || asset.name?.split(".").pop() || "").toLowerCase();

  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "other";
}
```

> ⚠️ **주의**: `webm`은 비디오 확장자! 누락하면 "미리보기 불가" 표시됨.

### 매직 바이트 검증 (선택)

```typescript
function isImageByMagicBytes(data: Uint8Array): boolean {
  if (data.length < 4) return false;

  const isPng = data[0] === 0x89 && data[1] === 0x50; // 89 50 4E 47
  const isJpeg = data[0] === 0xff && data[1] === 0xd8; // FF D8 FF
  const isWebp = data[0] === 0x52 && data[1] === 0x49; // RIFF
  const isGif = data[0] === 0x47 && data[1] === 0x49; // GIF8

  return isPng || isJpeg || isWebp || isGif;
}
```

---

## 에셋 URI 형식

> **테스트**: `tests/schema.test.ts` → `should parse additionalAssets with correct path format`

### 지원해야 하는 형식

| 형식                  | 설명                        | 예시                                   |
| --------------------- | --------------------------- | -------------------------------------- |
| `ccdefault:`          | 기본값 (스킵)               | -                                      |
| `embeded://`          | ZIP 내 경로                 | `embeded://assets/icon/image/icon.png` |
| `__asset:N`           | PNG 청크 인덱스             | `__asset:0`, `__asset:42`              |
| `~risuasset:path`     | **ZIP 내 에셋 경로**        | `~risuasset:assets/icon.png`           |
| `~risuasset:hash:ext` | **캐시 해시 참조** (구버전) | `~risuasset:abc123:png`                |
| 외부 URL              | 직접 URL                    | `https://example.com/img.png`          |

### ~risuasset 처리

> ⚠️ `~risuasset:`는 **두 가지 형식**이 있음!

```typescript
function resolveAssetPath(
  uri: string,
  assetDict: Record<string, Uint8Array>
): Uint8Array | null {
  if (uri.startsWith("ccdefault:")) return null;

  if (uri.startsWith("embeded://")) {
    const path = uri.replace("embeded://", "");
    return assetDict[path] || assetDict[`assets/${path}`] || null;
  }

  if (uri.startsWith("__asset:")) {
    const index = uri.replace("__asset:", "");
    return assetDict[`__asset/${index}`] || null;
  }

  // ⚠️ ~risuasset: 두 가지 형식!
  if (uri.startsWith("~risuasset:")) {
    const key = uri.replace("~risuasset:", "");

    // 1. 경로 형식: ~risuasset:assets/icon.png
    if (key.includes("/")) {
      return assetDict[key] || assetDict[key.replace("assets/", "")] || null;
    }

    // 2. 해시:확장자 형식 (구버전): ~risuasset:abc123:png
    const [hash] = key.split(":");
    return assetDict[hash] || null;
  }

  // 직접 경로
  return assetDict[uri] || assetDict[`assets/${uri}`] || null;
}
```

---

## Svelte 반응성 의존성

> **관련 파일**: `src/routes/+page.svelte` 등의 Svelte 컴포넌트

### 문제

Svelte의 `$:` 반응 블록에서 **명시적으로 참조**되지 않은 변수는 추적되지 않습니다:

```typescript
// ❌ 문제 코드
$: if (regexList) {
  // displayMode나 selectedIndex가 변경되어도 이 블록이 재실행되지 않음!
  filteredContent =
    displayMode === "single" ? [regexList[selectedIndex]] : regexList;
}
```

### 해결책

**명시적 변수 참조**:

```typescript
// ✅ 해결 코드
$: {
  const _mode = displayMode; // 명시적 의존성
  const _idx = selectedIndex; // 명시적 의존성

  if (regexList) {
    filteredContent = _mode === "single" ? [regexList[_idx]] : regexList;
  }
}
```

### 왜 이렇게 동작하나?

Svelte 컴파일러는 `$:` 블록의 **최상위 스코프**에서 참조되는 변수만 추적합니다:

- `if` 조건문 안의 참조는 추적되지 않을 수 있음
- 함수 호출 안의 참조도 마찬가지

---

## RPack WASM 필수

> **테스트**: `tests/rpack.test.ts`

### 문제

단순 256바이트 룩업 테이블로 RPack을 구현하면 **일부 파일에서 실패**합니다.

### 해결책

RisuAI 공식 WASM 모듈을 사용해야 합니다:

```typescript
// ✅ 올바른 방법
import { decode, encode } from "../rpack/rpack";

const decoded = await decode(rpackData);
```

### WASM 파일 위치

- 원본: `Risuai-*/src/ts/rpack/rpack_bg.wasm`
- 복사 위치: `src/lib/core/rpack/rpack_bg.wasm`

---

## 프리셋 필드 오타

> **관련 파일**: `.risup`, `.risupreset`

### 알려진 오타

| 실제 필드명       | 예상 필드명       | 설명        |
| ----------------- | ----------------- | ----------- |
| `PresensePenalty` | `PresencePenalty` | 존재 패널티 |

### 코드에서 주의

```typescript
// ⚠️ 오타 그대로 사용해야 함!
const penalty = preset.PresensePenalty; // PresencePenalty 아님!
```

---

## 체크리스트 (새 파서 구현 시)

| 항목                                    | 확인 |
| --------------------------------------- | :--: |
| **봇 카드 파싱 vs AI EXIF 구분**        |  ☐   |
| **x_meta 폴더 제외**                    |  ☐   |
| 폴더 ID에서 `\uf000folder:` prefix 처리 |  ☐   |
| 에셋 타입을 확장자로 판별 (webm 포함!)  |  ☐   |
| `~risuasset:` URI 두 가지 형식 지원     |  ☐   |
| RPack WASM 사용                         |  ☐   |
| Svelte $: 블록에서 명시적 의존성        |  ☐   |
| `PresensePenalty` 오타 처리             |  ☐   |

---

## 테스트 연동

이 문서의 모든 함정은 다음 테스트에서 검증됩니다:

```bash
pnpm test -- tests/schema.test.ts
```

### 테스트 파일 구조

```
tests/
├── schema.test.ts        # 스키마 구조 검증 (이 문서의 모든 항목)
├── parser.snapshot.test.ts  # 파싱 결과 스냅샷
├── risum.test.ts         # 모듈 파싱/익스포트
├── rpack.test.ts         # RPack 코덱
└── crypto.test.ts        # 암호화/복호화
```

---

## 문서 업데이트 시

새로운 함정을 발견하면:

1. 이 문서에 섹션 추가
2. `tests/schema.test.ts`에 테스트 케이스 추가
3. 관련 포맷 문서 (charx.md, risum.md, risup.md)에 경고 추가
