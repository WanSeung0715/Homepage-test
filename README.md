# Homepage-test

와수이의 정적 자기소개 페이지와 Cloudflare Pages 방명록입니다.

## Pages 방명록 구조

- `public/_worker.js`: Pages Advanced Mode Worker. `/api/guestbook` 요청은 D1/KV를 사용하고 나머지는 `env.ASSETS.fetch()`로 정적 파일에 전달합니다. 이 Worker가 `public/` 빌드 출력 안에 있어 Pages Git 빌드에 포함됩니다.
- `migrations/`: D1 방명록 테이블과 버전별 마이그레이션.
- `wrangler.toml`: Pages Advanced Mode, 실제 Production D1/KV 바인딩, Preview/Production 환경 설정.
- `index.html`: 반응형 방명록 화면.
- `public/`: Pages 정적 빌드 출력(HTML, OG 이미지, Advanced Mode `_worker.js`). `_worker.js`가 API 라우팅과 static assets 전달을 모두 처리합니다.

방문자가 작성한 이름과 메시지는 공개 페이지에 표시됩니다. 작성 시 비밀번호(영문·숫자·기호 4~9자)를 입력하면 해당 비밀번호로 수정·삭제할 수 있습니다. 비밀번호 원문은 저장하지 않으며, 글마다 별도 salt를 적용한 PBKDF2 해시만 저장합니다. 비밀번호를 잊으면 복구할 수 없고, `0001` 마이그레이션으로 만들어진 기존 글은 비밀번호가 없어 수정·삭제할 수 없습니다. 등록은 이름 40자·메시지 500자로 제한되며 작성 횟수 제한은 없습니다. 수정·삭제 시도는 IP당 시간당 10회, 공감은 시간당 60회로 제한합니다. 공감은 로그인 없는 IP 제한이므로 계정당 1회를 보장하지 않습니다. 글의 HTML은 텍스트로만 표시해 저장형 스크립트 실행을 방지합니다.

## 로컬 Pages 개발

요구 사항: Node.js LTS와 npm.

```powershell
npm.cmd exec --yes --package=wrangler -- wrangler d1 migrations apply homepage-test-guestbook --local
npm.cmd exec --yes --package=wrangler -- wrangler pages dev public
```

Wrangler는 `public/`의 정적 파일과 Advanced Mode `public/_worker.js`, SQLite 기반 로컬 D1/KV를 실행하며, 로컬 데이터베이스 파일은 `.wrangler/`에 둡니다. 이 디렉터리는 Git에 커밋하지 않습니다. 로컬 `sqlite3` CLI는 데이터베이스를 관리하는 도구일 뿐 공개 Cloudflare 사이트에서 접근할 수 있는 DB 서버가 아닙니다.

## Cloudflare Pages 배포

- Cloudflare Pages: `https://homepage-test-4g7.pages.dev`
- Production Worker bundle: `public/_worker.js` (Advanced Mode)
- Production D1: `homepage-test-guestbook` (`DB` binding)
- Production rate-limit KV: `homepage-test-guestbook-limiter` (`GUESTBOOK_LIMITER` binding)
- D1 마이그레이션 `0001` 및 `0002`는 원격 Production D1에 적용되어 있습니다.
- Production에서 글 작성 횟수 제한은 없고, 수정·삭제 시도는 IP당 시간당 10회, 공감은 시간당 60회로 제한됩니다.

새 프로젝트의 일반 배포 절차와 보안 체크리스트는 [`HOMEPAGE_PLAYBOOK.md`](HOMEPAGE_PLAYBOOK.md)를 참고하세요. 다른 프로젝트에는 이 저장소의 Cloudflare resource ID를 재사용하지 않습니다.

로컬 Wrangler D1 데이터는 Production DB와 별개이며 `.wrangler/`에 저장되어 Git에 포함되지 않습니다.