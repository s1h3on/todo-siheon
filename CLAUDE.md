# 할 일 메모판 (todo-app)

브라우저에서 바로 여는 포스트잇 스타일 할 일 목록 웹앱. 빌드 도구, 프레임워크, 서버 없이 순수 HTML/CSS/JS로 만든다.

## 파일 구조

- `index.html` — 화면 구조만. `style.css`, `config.js`, `app.js`를 불러온다.
- `style.css` — 모든 디자인. 색은 `:root`의 CSS 변수(`--bg`, `--accent` 등)로 관리한다.
- `config.js` — Supabase 접속 정보(`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). 공개용 publishable key만 넣는다.
- `app.js` — 모든 동작. 상태(`todos`, `loading`, `filter`, `editingId`, `selecting`, `selectedIds`)를 바꾼 뒤 `render()`로 화면 전체를 다시 그린다.
- `index-v1.html` — 맨 처음 만든 단순 버전. 참고용으로 보관 중이니 지우거나 고치지 않는다.

## 실행

`index.html`을 더블클릭하거나 `Start-Process index.html`로 기본 브라우저에서 연다. 설치할 것은 없다.
문법 검사: `node --check app.js`

## 기능

- 할 일 추가 / 완료 체크 / 삭제 / 수정(더블클릭 또는 ✏️, Esc로 취소)
- 필터: 전체 · 진행 중 · 완료
- 완료한 메모 모두 지우기
- 마감일은 버블로 고른다: 정하지 않음 · 오늘 · 내일 · 이번 주말(토요일) · 다음 주(+7일) · 📅 날짜 고르기
- 링크 첨부: 음악 사이트는 🎵, 나머지는 🔗로 표시하고 새 탭에서 연다
- 작성자 이름(선택, 20자까지): '추가' 버튼 왼쪽 칸에 적고, 메모에는 할 일 글 바로 아래 작은 글씨(`— 이름`)로 보인다. 추가한 뒤에도 이름 칸은 비우지 않는다.
- 여러 개 선택 모드: 메모 아무 곳이나 눌러 선택하고, 모두 선택 / 선택한 메모 지우기

## 지켜야 할 규칙

- **할 일은 Supabase의 `todos` 표에 저장한다.** `request()`로 표에 먼저 저장하고, 성공한 뒤에만 `todos`를 바꾼다. 실패하면 `save()`가 화면 위쪽(`#db-error`)에 오류를 보여 준다. 표의 빈 칸(null)은 앱에서 빈 글자("")로 다룬다 (`fromRow`, `toRow`).
- **`todos` 표의 권한 설정(RLS)은 사용자가 요청할 때만 바꾼다.** 지금은 RLS를 켜 두고, 규칙 4개(누구나 읽기·추가·고치기·지우기)로 로그인 없이 누구나 모든 일을 할 수 있게 열어 두었다.
- **디자인 톤**: 흰색과 베이지 사이의 차분한 색, 둥근 모서리, 버블(알약 모양) 버튼. 진한 원색이나 강한 그림자는 쓰지 않는다.
- **사용자 입력은 `textContent`로 넣는다.** `innerHTML`에 사용자 글을 넣지 않는다.
- **링크는 `normalizeLink()`를 거친다.** http/https만 허용하고, `rel="noopener noreferrer"`로 새 탭에서 연다.
- 날짜는 내 컴퓨터 시간 기준 `"YYYY-MM-DD"` 문자열로 다룬다 (`toDateString`, `addDays`, `daysUntil`).
- `[hidden]`은 CSS에서 `display: none !important`로 강제하고 있다. 숨김/표시는 `hidden` 속성으로 한다.
- 화면 글자와 코드 주석은 한국어로 쓴다.
- **주소·ID·열쇠는 `.env.local`에서 찾고, 새로 생기면 거기에 적는다.** 이 파일은 `.gitignore`로 git에서 빠져 있다.
