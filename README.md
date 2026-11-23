# BNK 카풀

입소 시 거점 도착 시각, 퇴소 시 연수원 또는 본점 출발 시각을 한국 시각으로 입력한다. 작성자가 신청을 승인하면 해당 동승자에게 오픈채팅 링크가 보인다. 서버에서 데이터를 공유하며 화면 복귀, 저장 직후, 15초 간격으로 갱신한다.

## 운영 배포

1. Supabase에서 전용 PostgreSQL 프로젝트를 만든다. SQL Editor에서 `sql/schema.sql`을 최초 1회 실행한 뒤 `sql/cleanup.sql`을 실행한다. 후자는 pg_cron을 활성화하고 매분 만료 자료를 지우는 작업을 등록한다. 만료 시각부터 모든 API 조회와 변경에서 해당 일정이 제외된다. 실제 행은 다음 작업에서 삭제된다. 일정 삭제 시 신청과 링크도 삭제되며 닉네임 계정은 유지된다.
2. SQL Editor에서 전용 로그인 역할을 생성한다. 아래 자리표시자를 영문·숫자로 구성한 임의의 긴 암호로 교체한다. 운영 비밀값은 저장소에 올리지 않는다.

   ```sql
   create role bnk_runtime login password 'REPLACE_WITH_RANDOM_PASSWORD' in role bnk_app;
   ```

3. 프로젝트 폴더의 내용을 GitHub 비공개 저장소에 올리고 Vercel에서 해당 저장소를 가져온다. 프로젝트 루트는 package.json이 있는 폴더이며 프레임워크는 Next.js이다.
4. Vercel의 서버 환경 변수에 아래 값을 지정한다. Preview는 별도 테스트 데이터베이스와 비밀값을 사용한다. 비밀값에 NEXT_PUBLIC_ 접두사를 붙이지 않는다.

| 변수 | 설정값 |
|---|---|
| DATABASE_URL | Supabase Connect에서 복사한 Transaction pooler 연결 문자열. 암호를 URL 인코딩하고 TLS 인증서 검증을 사용한다(sslmode=verify-full). pooler 사용자명의 postgres 부분을 bnk_runtime으로 바꾸고 전용 로그인 암호를 사용한다. |
| ENTRY_CODE | 동기들에게 별도로 공유할 공통 입장코드 |
| RATE_LIMIT_SECRET | IP 주소를 일방향 변환할 임의의 긴 비밀값 |
| APP_ORIGIN | 서비스의 정확한 HTTPS 주소. 끝의 슬래시는 제외한다. |

5. 배포 후 Supabase Cron 화면에서 bnk-expiry 작업의 실행 성공을 확인한다. 두 브라우저에서 별도 닉네임으로 접속해 신청 전후의 오픈채팅 버튼과 승인 후 참여 취소를 확인한다. 운영 링크는 이 검증 이후 공유한다.

## 개발 실행

Node.js 22.12 이상과 PostgreSQL을 사용한다. 운영과 분리한 DB에 스키마를 적용한다. .env.example을 .env.local로 복사해 값을 채운다. 개발 주소는 http://localhost:3000 이다.

```sh
npm ci
npm run dev
```

## 접근 권한

브라우저는 Next.js API로만 통신한다. carpool 스키마를 Supabase Data API에 노출하지 않는다. 테이블별 RLS를 켜고 서버 전용 역할에만 테이블 접근을 허용한다. 서버는 세션에 대응하는 사용자 ID로 권한을 검사하고 매개변수 바인딩으로 DB를 호출한다. 일정 단위 행 잠금 안에서 승인 인원 확인과 변경을 함께 수행한다. 링크와 신청자 명단은 조회 SQL에서 사용자별로 제한한다.

세션 원문은 HttpOnly 쿠키에만 두고 DB에는 해시를 저장한다. 운영 쿠키는 Secure, SameSite=Strict를 사용한다. 15분 동안 같은 네트워크에서 입장코드가 10회 틀리면 해당 구간이 끝날 때까지 추가 입장을 제한한다. 로컬 실행에서는 공통 제한 버킷을 사용한다. 복구 기능은 없으며 브라우저 저장정보 삭제 시 새 계정을 만든다.

## 검증

`npm run build`로 TypeScript와 운영 빌드를 확인한다. 통합 테스트는 **빈 일회용 DB와 그 DB를 사용하는 로컬 앱**에서만 실행한다. schema.sql 적용 후 TEST_ORIGIN, TEST_DATABASE_URL, TEST_ENTRY_CODE를 각각 테스트 앱 주소, 동일 DB 연결 문자열, 해당 입장코드로 설정하고 `node tests/integration.mjs`를 실행한다. 테스트는 일정을 만료 처리하고 정리 작업을 실행한다.

추천 경계값 테스트는 `node --experimental-strip-types tests/matching.mjs`로 실행한다.
