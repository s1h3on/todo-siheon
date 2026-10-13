# 할 일 메모판 (todo-app)

브라우저에서 바로 여는 포스트잇 스타일 할 일 목록 웹앱. 빌드 도구, 프레임워크, 설치할 라이브러리 없이 순수 HTML/CSS/JS로 만든다. 서버는 오노추 재생용으로 내 컴퓨터 안에서만 도는 `serve.js` 하나뿐이다.

## 파일 구조

- `index.html` — 화면 구조만. `style.css`, `config.js`, `app.js`를 불러온다.
- `style.css` — 모든 디자인. 색은 `:root`의 CSS 변수(`--bg`, `--accent` 등)로 관리한다.
- `config.js` — Supabase 접속 정보(`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). 공개용 publishable key만 넣는다.
- `app.js` — 모든 동작. 상태(`todos`, `loading`, `filter`, `editingId`, `selecting`, `selectedIds`)를 바꾼 뒤 `render()`로 화면 전체를 다시 그린다. 오노추 플레이어는 맨 아래 "오노추" 부분에 따로 있다 (`songs`, `songIndex`, `player`, `playing`, `lyrics`).
- `serve.js` — 내 컴퓨터 안(127.0.0.1:8123)에서만 도는 작은 서버. html/css/js 같은 정해진 종류만 내보내고, 점(.)으로 시작하는 파일·폴더(`.env.local`, `.git` 등)는 절대 내보내지 않는다.
- `열기.cmd` — 더블클릭하면 `serve.js`를 켜고 브라우저를 연다.
- `index-v1.html` — 맨 처음 만든 단순 버전. 참고용으로 보관 중이니 지우거나 고치지 않는다.

## 실행

`열기.cmd`를 더블클릭한다 (`http://localhost:8123`). 설치할 것은 없다 (Node만 있으면 된다).
`index.html`을 더블클릭해도 열리지만, YouTube가 file:// 페이지에서 재생을 막아서(오류 153) 오노추 재생과 실시간 가사는 안 된다.
문법 검사: `node --check app.js` · `node --check serve.js`
서버 시험할 때 브라우저를 안 열려면 `NO_BROWSER=1`.

## 기능

- 할 일 추가 / 완료 체크 / 삭제 / 수정(더블클릭 또는 ✏️, Esc로 취소)
- 필터: 전체 · 진행 중 · 완료
- 완료한 메모 모두 지우기
- 마감일은 버블로 고른다: 정하지 않음 · 오늘 · 내일 · 이번 주말(토요일) · 다음 주(+7일) · 📅 날짜 고르기
- 메모는 마감이 가까운 순서로 보인다 (`byDue`). 마감일이 없는 메모는 맨 아래, 마감일이 같으면 추가한 순서. `todos` 배열 자체는 추가한 순서 그대로 두고, 화면에 보일 때만 정렬한다.
- 링크 첨부: 음악 사이트는 🎵, 나머지는 🔗로 표시하고 새 탭에서 연다
- 작성자 이름(선택, 20자까지): '추가' 버튼 왼쪽 칸에 적고, 메모에는 할 일 글 바로 아래 작은 글씨(`— 이름`)로 보인다. 추가한 뒤에도 이름 칸은 비우지 않는다.
- 왼쪽 위 LP: 제목 왼쪽에서 검은 디스크가 항상 돈다 (윈도우 애니메이션 효과가 꺼져 있어도 돌아야 하므로 `prefers-reduced-motion`으로 멈추지 않는다). LP 양옆의 ‹ › 화살표로 이전·다음 색으로 넘기고(끝에서는 반대쪽 끝으로), LP를 누르면 색 버튼 모음이 떠서 눌러 고른다. 색 목록은 `LP_COLORS`(차분한 색 + 버건디 같은 고급스러운 색), 지금 색 번호는 `lpIndex`, 가운데 색은 `--lp-color`. 고른 색은 저장하지 않는다.
- 여러 개 선택 모드: 메모 아무 곳이나 눌러 선택하고, 모두 선택 / 선택한 메모 지우기
- 오노추(오늘의 노래 추천): 제목 오른쪽의 Y2K MP3 플레이어. 진주빛 몸통, 민트빛 LCD, 픽셀 글꼴(Galmuri).
  - 화면: 흘러가는 노래 제목 — 만든 사람, 지금 가사와 다음 가사, 진행 막대와 시간
  - 버튼: ⏮ · ▶ play / ❚❚ pause · ⏭ · ☰(노래 목록). 다 들으면 다음 노래로 넘어간다.
  - 노래 목록: Supabase `songs` 표에 저장. YouTube 링크만 받는다 (`youTubeId`). 링크를 넣으면 YouTube oEmbed로 제목·만든 사람을 짐작해 빈 칸을 채운다 (`guessSong`, 직접 고칠 수 있음).
  - 재생: YouTube IFrame 플레이어를 화면 밖(`.yt-box`)에 두고 소리만 쓴다.
  - 가사: LRCLIB(lrclib.net)에서 시간이 붙은 가사(`syncedLyrics`)를 찾아 재생 시간에 맞춰 보여 준다 (`findLyrics`, `parseLrc`, 0.25초마다 `tick`). 가사는 저장하지 않는다.

## 지켜야 할 규칙

- **할 일은 Supabase의 `todos` 표에 저장한다.** `request()`로 표에 먼저 저장하고, 성공한 뒤에만 `todos`를 바꾼다. 실패하면 `save()`가 화면 위쪽(`#db-error`)에 오류를 보여 준다. 표의 빈 칸(null)은 앱에서 빈 글자("")로 다룬다 (`fromRow`, `toRow`).
- **`todos`·`songs` 표의 권한 설정(RLS)은 사용자가 요청할 때만 바꾼다.** 지금은 두 표 모두 RLS를 켜 두고, 규칙 4개(누구나 읽기·추가·고치기·지우기)로 로그인 없이 누구나 모든 일을 할 수 있게 열어 두었다.
- `request(method, query, body, table)` — `table`을 안 주면 `todos`. 오노추는 `"songs"`를 준다.
- 바깥 서비스: Supabase, YouTube(oEmbed·IFrame API), LRCLIB, jsDelivr(Galmuri 글꼴). 열쇠가 필요한 서비스는 쓰지 않는다.
- **디자인 톤**: 흰색과 베이지 사이의 차분한 색, 둥근 모서리, 버블(알약 모양) 버튼. 진한 원색이나 강한 그림자는 쓰지 않는다. (예외: 사용자가 요청한 검은 LP, Y2K 느낌의 오노추 플레이어)
- **사용자 입력은 `textContent`로 넣는다.** `innerHTML`에 사용자 글을 넣지 않는다.
- **링크는 `normalizeLink()`를 거친다.** http/https만 허용하고, `rel="noopener noreferrer"`로 새 탭에서 연다.
- 날짜는 내 컴퓨터 시간 기준 `"YYYY-MM-DD"` 문자열로 다룬다 (`toDateString`, `addDays`, `daysUntil`).
- `[hidden]`은 CSS에서 `display: none !important`로 강제하고 있다. 숨김/표시는 `hidden` 속성으로 한다.
- 화면 글자와 코드 주석은 한국어로 쓴다.
- **주소·ID·열쇠는 `.env.local`에서 찾고, 새로 생기면 거기에 적는다.** 이 파일은 `.gitignore`로 git에서 빠져 있다.
