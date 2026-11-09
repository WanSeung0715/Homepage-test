# 정적 홈페이지 제작 플레이북

이 문서는 다음 홈페이지 프로젝트를 시작할 때 참고하는 재사용 가이드입니다. 이번 프로젝트의 실제 구성(Cloudflare Pages, Advanced Mode Worker, D1, KV)을 기준으로 작성했으며, 프로젝트별 이름·도메인·계정 ID·리소스 ID는 복사하지 말고 새 프로젝트 값으로 교체합니다.

## 1. 시작 전 확인

- 현재 저장소 구조, 사용 중인 프레임워크/런타임, 기본 브랜치, 원격 저장소를 먼저 확인합니다.
- 사용자 요구사항을 화면/기능/API/데이터/배포 단계로 나눠 정리합니다.
- 기존 코드 스타일과 빌드·배포 설정을 확인한 뒤 필요한 도구만 설치합니다.
- 개인정보는 공개 페이지나 OG 이미지에 넣기 전에 명시적으로 확인합니다.
- 외부 서비스나 라이브러리는 공식 문서와 프로젝트 요구사항에서 지원 여부를 확인합니다.

## 2. 정적 사이트 구조

순수 HTML/CSS/JavaScript 페이지의 기본 예시:

```text
project/
├── index.html
├── public/
│   ├── index.html       # Cloudflare Pages 배포본
│   ├── og-image.png     # 공유 미리보기 이미지
│   └── _worker.js       # Pages Advanced Mode 사용 시
├── wrangler.toml
└── README.md
```

- CSS와 JavaScript는 가능하면 목적별로 나누고, 폼 입력은 브라우저와 서버에서 모두 검증합니다.
- 사용자 제공 텍스트는 HTML 문자열로 삽입하지 않고 DOM의 `textContent`로 렌더링해 XSS를 방지합니다.
- 모바일 레이아웃, 키보드 포커스, `aria-live`, `prefers-reduced-motion` 등 접근성을 함께 확인합니다.
- 로컬 원본과 Pages 정적 출력 복사본을 함께 유지한다면 항상 동기화하고, 배포 전에 파일 해시/내용을 비교합니다.
- 데이터가 쌓이는 목록은 API에서 제한된 페이지 크기로 가져옵니다. 날짜순 방명록은 첫 화면의 위치와 연속성이 중요하므로 커서 페이지네이션과 명시적인 “더 보기” 버튼을 우선 검토합니다. 콘텐츠 탐색이 주목적인 피드에만 자동 infinite scroll을 고려합니다.
- 최초 로딩·추가 페이지 로딩에는 짧은 스켈레톤 UI와 `role="status"`/`aria-live` 진행 안내를 적용하고, 빈 목록·오류·마지막 페이지 상태도 구분합니다.

## 3. 타이틀·검색 설명·소셜 메타데이터

기본 `<head>`에 다음 항목을 설정합니다.

```html
<title>사이트 이름 | 한 줄 설명</title>
<meta name="description" content="페이지 내용을 사실에 맞게 요약한 설명" />
<meta property="og:type" content="website" />
<meta property="og:title" content="사이트 이름 | 한 줄 설명" />
<meta property="og:description" content="페이지 설명" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

- OG 이미지 권장 비율은 1200×630입니다. 가능하면 SVG 대신 소셜 플랫폼에서 널리 지원되는 PNG/JPEG를 사용합니다.
- 공개 페이지 URL을 알고 있으면 `og:url`과 canonical URL에 실제 절대 URL을 설정합니다. 도메인을 추측하지 않습니다.
- 설명문은 페이지에 실제 있는 사실만 요약하고, 검색 키워드 반복이나 근거 없는 홍보 문구를 넣지 않습니다.
- `im-not-ai` 같은 AI 윤문 스킬 저장소는 온라인 입력 웹서비스와 다릅니다. 공식 UI/API가 확인되지 않았다면 사용했다고 주장하지 않습니다.

## 4. Cloudflare Pages의 Worker/DB 구조 선택

### 정적 페이지에 API/DB가 필요 없는 경우

- 별도 Worker나 D1을 넣지 않고 정적 자산만 배포합니다.
- Pages Free 플랜 기준 프로젝트/빌드 한도는 최신 공식 문서에서 확인합니다.

### Pages Functions와 D1/KV를 추가하는 경우

Cloudflare Pages의 일반 파일 기반 Functions는 `/functions` 폴더가 Pages 프로젝트의 **repository root**에 있어야 합니다. `public/` 같은 정적 출력 폴더 내부에 파일 기반 `functions/`를 넣는 것과 혼동하지 않습니다.

이번 사이트는 `public/`을 Pages 빌드 산출물로 사용하므로 Advanced Mode를 적용했습니다.

```text
project/
├── public/
│   ├── index.html
│   ├── og-image.svg
│   └── _worker.js       # Pages output 안에 있어야 함
├── migrations/
│   ├── 0001_*.sql
│   └── 0002_*.sql
├── wrangler.toml
└── README.md
```

Advanced Mode Worker가 모든 요청을 제어하므로 정적 페이지를 반드시 전달합니다.

```js
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env)
    }
    return env.ASSETS.fetch(request)
  },
}
```

`ASSETS.fetch(request)`를 생략하면 HTML, 이미지, CSS 등 정적 자산이 깨집니다. Advanced Mode에서는 기존 `/functions` 디렉터리의 파일 라우팅이 무시되므로 `/functions`와 `_worker.js`를 중복 source-of-truth로 유지하지 않습니다.

## 5. D1/KV 및 로컬/운영 분리

`wrangler.toml`에는 실제 Cloudflare 리소스 ID를 사용합니다. 이름과 binding 이름은 코드와 일치해야 합니다.

```toml
name = "your-pages-project"
compatibility_date = "YYYY-MM-DD"
pages_build_output_dir = "public"

[[d1_databases]]
binding = "DB"
database_name = "your-guestbook-db"
database_id = "<실제 Cloudflare D1 ID>"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "GUESTBOOK_LIMITER"
id = "<실제 Cloudflare KV namespace ID>"
```

- 실제 ID를 임의로 만들거나 placeholder를 Production에 배포하지 않습니다.
- 로컬 개발 데이터는 Wrangler가 관리하는 `.wrangler/` 안에 두고 Git에 포함하지 않습니다.
- D1 로컬/운영 데이터는 분리합니다.
- 로컬 스키마 적용: `npx wrangler d1 migrations apply <DB 이름> --local`
- 운영 스키마 적용: `npx wrangler d1 migrations apply <DB 이름> --remote`
- 원격 마이그레이션 전 database name/ID, 환경 및 변경 SQL을 다시 확인합니다.
- Git-integrated Pages에서는 Production과 Preview 각각의 **Settings → Bindings**에서 `DB`, `GUESTBOOK_LIMITER`를 설정하고 재배포 후 API를 검증합니다. 대시보드 설정도 각각 적용됐는지 확인합니다.
- 비밀 키는 `.dev.vars` 또는 환경변수로 관리하며 Git에 커밋하지 않습니다.

## 6. 공개 방명록 보안 체크리스트

- 공개되는 이름/메시지임을 입력창 가까이에 알립니다.
- 이름/메시지 최대 길이, JSON Content-Type, body byte 크기를 서버에서 검증합니다.
- SQL은 prepared statement와 bound parameters로만 실행합니다.
- 글은 `textContent`로 렌더링합니다. `innerHTML`로 사용자 값을 삽입하지 않습니다.
- 수정/삭제 비밀번호를 저장할 때 평문 저장 금지. 사용자마다 salt를 만들고 Web Crypto PBKDF2 등 Workers에서 지원하는 해시를 사용합니다.
- 해시·salt·비밀번호는 공개 GET 응답에 포함하지 않습니다.
- 비밀번호 글자 길이/허용 문자 규칙은 browser form과 Worker API에서 완전히 일치시킵니다. Cloudflare Workers의 PBKDF2 iteration 상한은 공식 문서에서 확인합니다.
- 수정/삭제 시도와 공감은 IP rate limit을 검토합니다. 로그인이나 식별 토큰이 없으면 IP 제한은 “1인 1회”를 보장하지 않는다고 명시합니다.
- API 오류는 사용자에게 일반 오류로 반환하고 내부 예외에는 비밀번호/요청 본문을 기록하지 않습니다.
- 공개 글을 누가/어떻게 삭제할지 관리 방법을 마련합니다.
- 생성한 실제 비밀번호가 없는 기존 글은 수정/삭제할 수 없습니다. 마이그레이션 때 소유권을 임의로 만들지 않습니다.

## 7. Rate limit 정책을 바꿀 때

- 로컬 테스트와 Production 정책을 같은 변수 하나로 제어할 경우 Production override를 반드시 명시하고 검증합니다.
- “작성 무제한” 요청은 **작성 제한만** 제거하고, 비밀번호 검증·내용 제한·관리/공감 제한은 유지합니다.
- API 코드, 안내 문구, README, 로컬 테스트, 원격 테스트가 정책과 일치하는지 확인합니다.
- 클라이언트 validation만 믿지 말고 Worker 서버에서도 동일한 제약을 확인합니다.

## 8. 검증 순서

1. HTML: 타이틀/description/OG/Twitter 메타와 모바일 표시를 확인합니다.
2. 정적 파일: OG 이미지, CSS/JS가 Pages output에 들어 있는지 확인합니다.
3. Worker: `node --check public/_worker.js`, Wrangler 로컬 compile을 실행합니다.
4. 로컬 Pages: `npx wrangler pages dev public`으로 HTML→`ASSETS.fetch`와 API 라우팅을 확인합니다.
5. 로컬 D1: 모든 migrations 적용 후 GET/POST/PATCH/DELETE/like와 오류 상태를 테스트합니다.
6. XSS payload가 글자로만 렌더링되는지 확인합니다.
7. 원격 binding 및 migrations를 확인한 후 Preview 또는 Production 배포를 실행합니다.
8. 실제 배포 URL에서 `GET /api/guestbook`, 정적 홈페이지, 이미지, submit/edit/delete/like를 검증합니다. 테스트 게시물은 비밀번호로 삭제해 운영 DB에 남기지 않습니다.
9. Cloudflare Git 연결은 push마다 자동 빌드됩니다. 보통 push 후 Git 빌드를 기다리고, `wrangler pages deploy`를 중복으로 실행하지 않습니다.
10. 최종 배포 ID/URL, 실제 원격 commit SHA, D1/KV binding, 작업 트리 상태를 확인합니다.

## 9. 이번 저장소의 현재 경로

- GitHub: `https://github.com/WanSeung0715/Homepage-test`
- Cloudflare Pages: `https://homepage-test-4g7.pages.dev`
- Static output: `public/`
- Advanced Mode Worker: `public/_worker.js`
- D1 database: `homepage-test-guestbook` (`DB` binding)
- KV namespace: `homepage-test-guestbook-limiter` (`GUESTBOOK_LIMITER` binding)

다른 프로젝트에는 위 프로젝트별 이름·URL·ID를 복사하지 말고 해당 Cloudflare 계정에서 새 리소스를 생성해 실제 값으로 교체합니다.