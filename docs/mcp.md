# MCP

`risu-workspace-tools`는 stdio MCP 서버를 제공합니다.

## 실행

Windows PowerShell 기준:

```powershell
npm run mcp -- --allow-root C:\Users\<user>\RisuWorkspaces --allow-root C:\input
```

또는:

```powershell
$env:RISU_MCP_ALLOWED_ROOTS = "C:\Users\<user>\RisuWorkspaces;C:\input"
npm run mcp
```

중요:

- MCP 서버는 최소 한 개의 허용 루트가 없으면 시작하지 않습니다.
- 허용 루트 밖 입력/작업장/출력 경로는 거부됩니다.
- 성공/오류 응답의 경로는 `<allowed-root>/...`로 마스킹됩니다.

## 제공 툴

### `extract_project`

입력:

```json
{
  "inputPath": "C:\\input\\sample.charx",
  "projectDir": "C:\\Users\\<user>\\RisuWorkspaces\\sample-bot"
}
```

출력:

```json
{
  "command": "extract",
  "inputPath": "<allowed-root:2>/sample.charx",
  "projectDir": "<allowed-root:1>/sample-bot",
  "format": "charx",
  "kind": "bot"
}
```

### `build_project`

입력:

```json
{
  "projectDir": "C:\\Users\\<user>\\RisuWorkspaces\\sample-bot",
  "outputPath": "C:\\Users\\<user>\\RisuWorkspaces\\out\\sample-bot.charx"
}
```

출력:

```json
{
  "command": "build",
  "projectDir": "<allowed-root:1>/sample-bot",
  "outputPath": "<allowed-root:1>/out/sample-bot.charx",
  "kind": "bot",
  "sourceFormat": "charx"
}
```

### `inspect_input`

입력:

```json
{
  "inputPath": "C:\\input\\sample.risum"
}
```

출력:

```json
{
  "command": "inspect",
  "inputPath": "<allowed-root:2>/sample.risum",
  "format": "risum",
  "details": {
    "kind": "module"
  }
}
```

## 반환 형식

모든 툴은 아래 두 값을 함께 반환합니다.

- `content[0].text`: 사람이 읽기 쉬운 요약
- `structuredContent`: 기계가 읽기 쉬운 JSON

오류 시:

- `isError: true`
- `content[0].text`: `오류: ...`
