# Homepage-test

와수이의 정적 자기소개 페이지와 Cloudflare Pages 방명록입니다.

## Pages 방명록 구조

- `public/_worker.js`: Pages Advanced Mode Worker. `/api/guestbook` 요청은 D1/KV를 사용하고 나머지는 `env.ASSETS.fetch()`로 정적 파일에 전달합니다. 이 Worker가 `public/` 빌드 출력 안에 있어 Pages Git 빌드에 포함됩니다.
- `migrations/`: D1 방명록 테이블과 버전별 마이그레이션.
- `wrangler.toml`: Pages D1/KV 바인딩. 파일의 ID는 로컬 검증용 자리표시자입니다.
- `index.html`: 반응형 방명록 화면.
- `public/`: Pages 정적 빌드 출력(HTML, OG 이미지, Advanced Mode `_worker.js`). `_worker.js`가 API 라우팅과 static assets 전달을 모두 처리합니다.

방문자가 작성한 이름과 메시지는 공개 페이지에 표시됩니다. 작성 시 비밀번호(영문·숫자·기호 4~9자)를 입력하면 해당 비밀번호로 수정·삭제할 수 있습니다. 비밀번호 원문은 저장하지 않으며, 글마다 별도 salt를 적용한 PBKDF2 해시만 저장합니다. 비밀번호를 잊으면 복구할 수 없고, `0001` 마이그레이션으로 만들어진 기존 글은 비밀번호가 없어 수정·삭제할 수 없습니다. 등록은 이름 40자·메시지 500자로 제한되며, `wrangler.toml`의 기본 로컬 개발 환경에서는 단독 테스트를 위해 요청 횟수 제한을 끄고, Production과 Preview에서는 IP별 KV 제한(작성 시간당 5회, 수정·삭제 시도 10회, 공감 60회)을 적용합니다. 공감은 로그인 없는 IP 제한이므로 계정당 1회를 보장하지 않습니다. 글의 HTML은 텍스트로만 표시해 저장형 스크립트 실행을 방지합니다. 공개 방명록을 운영하기 전에 Cloudflare의 KV/D1 바인딩 설정을 완료하고 부적절한 메시지를 삭제할 관리 방법을 정하세요.

## 로컬 Pages 개발

요구 사항: Node.js LTS와 npm.

```powershell
npm.cmd exec --yes --package=wrangler -- wrangler d1 migrations apply homepage-test-guestbook --local
npm.cmd exec --yes --package=wrangler -- wrangler pages dev public
```

Wrangler는 `public/`의 정적 파일과 `functions/`의 Pages Functions, SQLite 기반 로컬 D1을 실행하며, 로컬 데이터베이스 파일은 `.wrangler/`에 둡니다. 이 디렉터리는 Git에 커밋하지 않습니다. 로컬 `sqlite3` CLI는 데이터베이스를 관리하는 도구일 뿐 공개 Cloudflare 사이트에서 접근할 수 있는 DB 서버가 아닙니다.

## Cloudflare Pages 배포 설정

1. Cloudflare Dashboard의 **Workers & Pages → D1**에서 `homepage-test-guestbook` 데이터베이스를 만들고 실제 `database_id`를 받습니다.
2. Cloudflare Dashboard의 **Workers & Pages → KV**에서 방명록 요청 제한용 KV namespace를 만듭니다.
3. `wrangler.toml`의 `database_id`와 KV namespace `id`를 실제 Cloudflare ID로 바꿉니다. 자리표시자 상태로 원격에 배포하지 마세요.
4. Pages 프로젝트의 **Settings → Bindings**에서 Production과 Preview 모두 아래 리소스를 연결합니다.
   - D1 database: binding name `DB` → `homepage-test-guestbook`
   - KV namespace: binding name `GUESTBOOK_LIMITER` → 위에서 만든 namespace
5. 설정을 저장하고 Pages 프로젝트를 재배포한 뒤 원격 D1 마이그레이션을 적용합니다.

```powershell
npm.cmd exec --yes --package=wrangler -- wrangler d1 migrations apply homepage-test-guestbook --remote
```

운영 마이그레이션 명령은 `wrangler.toml`의 실제 D1 ID를 넣은 뒤 실행합니다. 운영 D1에 접근 가능한 Cloudflare 계정으로 `wrangler login`이 필요합니다.

로컬 D1의 글은 Cloudflare 운영 D1과 별개입니다. Pages 프로젝트 바인딩이 아직 설정되지 않았다면 API는 `503`을 반환합니다. 임의의 D1/KV ID를 운영 환경에 사용하지 마세요.