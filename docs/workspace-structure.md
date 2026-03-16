# 작업장 구조 (v2)

> 사용자가 관리하는 **작업장(workspace)** 구조 레퍼런스.
> 도구(RisuCMP) 내부 구조는 → [project-structure.md](./project-structure.md)

---

## 전체 흐름

```mermaid
flowchart LR
    A["원본 파일<br/>.charx .risum .risup 등"] -->|extract| B["작업장"]
    B --> C["src/ 수정<br/>사람 · AI · Git"]
    B --> D["pack/ assets/<br/>로컬 전용"]
    C -->|build| E["dist/ 결과물"]
    D -->|build| E
```

---

## 도구 vs 작업장

```text
C:\Dev\RisuCMP\                         ← 도구 저장소 (clone)
C:\Users\<user>\RisuWorkspaces\         ← 작업장 루트 (권장)
  ├─ my-bot\
  ├─ my-module\
  └─ my-preset\
```

> **규칙**: 작업장은 도구 저장소 밖에 둔다.
> `RisuCMP\workspace\`는 개발 테스트 전용.

---

## 작업장 내부 구조

### 봇

```text
my-bot/
├─ project.meta.json
├─ src/
│  ├─ card/
│  │  ├─ name.txt
│  │  ├─ description.md
│  │  ├─ first-message.md
│  │  ├─ alternate-greetings/
│  │  ├─ global-note.md
│  │  ├─ default-variables.txt
│  │  └─ styles/
│  └─ module/           ← 내장 모듈이 있을 때
│     ├─ src/
│     │  ├─ lorebook/
│     │  ├─ regex/
│     │  ├─ trigger.lua | trigger.json
│     │  └─ styles/
│     ├─ pack/
│     └─ assets/
├─ pack/
│  ├─ bot.meta.json
│  ├─ card/
│  │  ├─ card.meta.json
│  │  └─ card.raw.json
│  ├─ x_meta/
│  └─ _preserved/
├─ assets/
└─ dist/
```

### 모듈

```text
my-module/
├─ project.meta.json
├─ src/
│  ├─ lorebook/
│  ├─ regex/
│  ├─ trigger.lua | trigger.json
│  └─ styles/
├─ pack/
│  ├─ module.json
│  ├─ module.assets.json
│  ├─ module.meta.json
│  ├─ lorebook.meta.json
│  ├─ regex.meta.json
│  └─ trigger.meta.json
├─ assets/
└─ dist/
```

### 프리셋

```text
my-preset/
├─ project.meta.json
├─ src/
│  ├─ name.txt
│  ├─ main-prompt.md
│  ├─ jailbreak.md
│  ├─ global-note.md
│  ├─ custom-prompt-template-toggle.txt
│  ├─ template-default-variables.txt
│  ├─ prompt-template/
│  └─ regex/
├─ pack/
│  ├─ preset.raw.json
│  ├─ preset.meta.json
│  ├─ risup.meta.json
│  ├─ prompt-template.meta.json
│  └─ regex.meta.json
└─ dist/
```

---

## 영역별 역할

| 영역 | 역할 | 사람 수정 | AI 수정 | Git 추적 | build 필요 |
|------|------|:---------:|:-------:|:--------:|:----------:|
| `project.meta.json` | extract가 자동 생성하는 프로젝트 메타 | × | × | ○ | ○ |
| `src/` | 텍스트 콘텐츠 (로어북·regex·프롬프트·스타일 등) | ○ | ○ | ○ | ○ |
| `pack/` | 빌드용 내부 데이터·원본 보존 | × | × | × | ○ |
| `assets/` | 이미지·오디오 등 바이너리 자산 | △ | △ | × | ○ |
| `dist/` | 빌드 결과물 | × | × | × | — |

> ○ 기본 대상 / △ 필요 시 / × 하지 않음

> [!WARNING]
> `pack/`과 `assets/`가 없으면 build는 실패한다.
> 새 환경에서 작업을 시작할 때는 반드시 원본 파일에서 재-extract하거나,
> 기존 환경의 `pack/` · `assets/`를 복사해 와야 한다.

---

## AI 에이전트 지침

CMP는 extract 시 **기본 에이전트 지침 파일을 작업장에 생성**할 수 있다 (계획).
사용자는 이를 그대로 쓰거나, 자신의 작업장에 맞게 커스텀·확장할 수 있다.

```text
my-workspace/
├─ AGENTS.md                           ← 상위 규칙 (CMP 기본 제공 → 사용자 커스텀)
└─ .agents/skills/risu-workspace/
   └─ SKILL.md                         ← 상세 작업 절차 (CMP 기본 제공 → 사용자 커스텀)
```

| 파일 | 내용 예시 |
|------|----------|
| `AGENTS.md` | 수정 대상은 `src/`, `pack/` 직접 수정 금지, 빌드 명령 |
| `SKILL.md` | 우선 읽을 파일, lorebook 편집 규칙, 빌드 전 체크리스트 |

> 현재 CMP의 `.agents/skills/risu-workspace-tools/SKILL.md`는
> **도구 저장소 자체**의 개발 스킬이며, 사용자 작업장용 스킬과는 별개이다.

---

## Git 정책

### .gitignore

```gitignore
pack/
assets/
dist/
.tmp/
.cache/
Thumbs.db
Desktop.ini
```

### 추적 대상 요약

```mermaid
flowchart LR
    subgraph tracked["Git 추적 ○"]
        A["project.meta.json"]
        B["src/**"]
    end
    subgraph ignored["Git 비추적 ×"]
        C["pack/"]
        D["assets/"]
        E["dist/"]
    end
```

### 새 환경에서의 복원 흐름

```mermaid
flowchart TD
    A["git clone"] --> B{"pack/ · assets/ 존재?"}
    B -->|있음| C["바로 build 가능"]
    B -->|없음| D["원본 파일로 재-extract"]
    D --> C
```

---

## CLI 사용 예시

```powershell
# extract
risu-workspace-tools extract C:\input\sample.risum C:\Users\<user>\RisuWorkspaces\sample

# 작업장으로 이동 후 빌드
Set-Location C:\Users\<user>\RisuWorkspaces\sample
risu-workspace-tools build .

# inspect
risu-workspace-tools inspect C:\input\sample.risum
```

---

## v1 문서와의 용어 대응

v1에서 제안했던 이름과 실제 구현 이름의 대응표.

| v1 제안 | 실제 구현 | 비고 |
|---------|----------|------|
| `content/` | `src/` | 사람이 수정하는 콘텐츠 |
| `.cmp/` | `pack/` | 빌드용 내부 데이터 |
| `dist/` | `dist/` | 동일 |
