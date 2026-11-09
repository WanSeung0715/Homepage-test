# 와수이 홈페이지

**와수이의 자기소개와 방명록은 Cloudflare Pages에서 확인할 수 있습니다.** 방문자는 이름과 메시지를 남기고, 작성한 글을 비밀번호로 관리할 수 있습니다.

- 홈페이지: <https://homepage-test-4g7.pages.dev>
- GitHub 저장소: <https://github.com/WanSeung0715/Homepage-test>

## 제작 방식

페이지는 정적 HTML·CSS·JavaScript로 만들었습니다. Cloudflare Pages Advanced Mode의 `public/_worker.js`가 API 요청을 처리하고, 그 밖의 요청은 `env.ASSETS.fetch()`로 정적 페이지와 이미지를 제공합니다. 방명록 데이터는 D1에 저장하고 요청 제한에는 KV를 사용합니다.

소스 HTML은 `index.html`, Pages 배포 파일은 `public/`에 둡니다. Open Graph 메타데이터와 공유 이미지도 포함했습니다.

## 방명록

새 글에는 이름, 메시지와 **영문·숫자·기호 4~9자 비밀번호**가 필요합니다. 비밀번호 원문은 저장하지 않고 글마다 별도의 salt를 적용한 PBKDF2 해시만 저장합니다. 비밀번호를 잊으면 복구할 수 없으며, 해시가 없는 기존 글은 수정·삭제할 수 없습니다.

작성 횟수 제한은 없습니다. 수정·삭제 시도는 IP 기준 시간당 10회, 공감은 시간당 60회로 제한합니다. 공감에는 로그인이 필요하지 않아 IP 제한만으로 1인 1회를 보장하지는 않습니다. 이름과 메시지는 공개되며, 입력한 HTML은 실행되지 않고 텍스트로 표시됩니다.

## 로컬 개발

Node.js LTS와 Wrangler CLI가 필요합니다. 프로젝트 루트에서 로컬 D1 마이그레이션을 적용하고 Pages 개발 서버를 실행합니다.

```powershell
wrangler d1 migrations apply homepage-test-guestbook --local
wrangler pages dev public
```

로컬 D1 데이터는 `.wrangler/`에 저장되며 운영 D1과 별개입니다. 이 디렉터리와 비밀 정보는 Git에 올리지 않습니다.

## 배포와 새 프로젝트

GitHub `main` 브랜치가 Cloudflare Pages에 연결되어 있습니다. 운영 D1 바인딩 이름은 `DB`, KV 바인딩 이름은 `GUESTBOOK_LIMITER`이며 D1 마이그레이션은 `migrations/`에서 관리합니다.

다음 홈페이지 제작 시 재사용할 구조·보안·검증 절차는 [`HOMEPAGE_PLAYBOOK.md`](HOMEPAGE_PLAYBOOK.md)를 참고하세요. 다른 프로젝트에서는 이 저장소의 ID와 리소스 이름을 그대로 쓰지 말고 새 값으로 설정합니다.

## 윤문 참고

README는 기능·사실·수치를 유지하면서 불필요한 표현을 줄여 정리했습니다. 참고한 `im-not-ai` 저장소는 온라인 변환 API가 아니라 코딩 에이전트용 한국어 윤문 스킬이므로, 웹 API를 호출했다고 표기하지 않았습니다.