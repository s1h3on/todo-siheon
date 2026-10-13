const COLORS = ["white", "ivory", "cream", "linen", "sand"];
const MUSIC_SITES = ["youtube.com", "youtu.be", "music.youtube.com", "spotify.com", "melon.com", "genie.co.kr", "soundcloud.com", "music.apple.com"];

const addForm = document.getElementById("add-form");
const textInput = document.getElementById("text-input");
const linkInput = document.getElementById("link-input");
const authorInput = document.getElementById("author-input");
const addError = document.getElementById("add-error");
const addButton = addForm.querySelector(".add-btn");
const board = document.getElementById("board");
const empty = document.getElementById("empty");
const summary = document.getElementById("summary");
const clearDoneBtn = document.getElementById("clear-done");
const filterButtons = document.querySelectorAll(".filter-btn");
const normalTools = document.getElementById("normal-tools");
const selectTools = document.getElementById("select-tools");
const selectModeBtn = document.getElementById("select-mode");
const selectCount = document.getElementById("select-count");
const selectAllBtn = document.getElementById("select-all");
const deleteSelectedBtn = document.getElementById("delete-selected");
const selectDoneBtn = document.getElementById("select-done");
const dbError = document.getElementById("db-error");
const lpWrap = document.getElementById("lp-wrap");
const lp = document.getElementById("lp");
const lpPalette = document.getElementById("lp-palette");
const lpPrev = document.getElementById("lp-prev");
const lpNext = document.getElementById("lp-next");

let todos = [];
let loading = true;
let filter = "all";
let editingId = null;
let selecting = false;
let selectedIds = new Set();

// ----- 날짜 도우미 (모두 내 컴퓨터 시간 기준, "YYYY-MM-DD" 문자열) -----

function toDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

// 오늘부터 며칠 남았는지 (지났으면 음수)
function daysUntil(due) {
  const [y, m, d] = due.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// 마감일 버블 목록. 날짜는 고르는 순간에 계산해요.
const DUE_PRESETS = [
  { key: "none", label: "정하지 않음", date: () => "" },
  { key: "today", label: "오늘", date: () => addDays(0) },
  { key: "tomorrow", label: "내일", date: () => addDays(1) },
  // 토요일까지 남은 날 수. 토·일요일에 고르면 오늘이 마감일이에요.
  { key: "weekend", label: "이번 주말", date: () => addDays(new Date().getDay() === 0 ? 0 : 6 - new Date().getDay()) },
  { key: "nextweek", label: "다음 주", date: () => addDays(7) },
];

function describeDue(due) {
  const days = daysUntil(due);
  const [, m, d] = due.split("-").map(Number);
  if (days < 0) return { text: `${-days}일 지났어요`, level: "overdue" };
  if (days === 0) return { text: "오늘까지", level: "soon" };
  if (days === 1) return { text: "내일까지", level: "soon" };
  return { text: `${m}월 ${d}일 · D-${days}`, level: "" };
}

// 버블로 마감일을 고르는 부품. element를 화면에 붙이고 getValue()로 날짜를 읽어요.
function createDuePicker(initialDue = "") {
  const wrap = document.createElement("div");
  wrap.className = "due-picker";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.hidden = true;

  const bubbles = [];
  let selectedKey = "none";

  function select(key) {
    selectedKey = key;
    bubbles.forEach((b) => b.classList.toggle("selected", b.dataset.key === key));
    dateInput.hidden = key !== "custom";
    if (key === "custom" && !dateInput.value) dateInput.value = addDays(0);
  }

  const options = [...DUE_PRESETS, { key: "custom", label: "📅 날짜 고르기" }];
  for (const option of options) {
    const bubble = document.createElement("button");
    bubble.type = "button";
    bubble.className = "bubble";
    bubble.dataset.key = option.key;
    bubble.textContent = option.label;
    bubble.addEventListener("click", () => {
      select(option.key);
      if (option.key === "custom") dateInput.focus();
    });
    bubbles.push(bubble);
    wrap.appendChild(bubble);
  }
  wrap.appendChild(dateInput);

  // 수정할 때: 기존 날짜가 버블 중 하나와 같으면 그 버블을, 아니면 '날짜 고르기'를 켜요
  const match = DUE_PRESETS.find((p) => p.date() === initialDue);
  if (match) {
    select(match.key);
  } else {
    dateInput.value = initialDue;
    select("custom");
  }

  return {
    element: wrap,
    getValue() {
      if (selectedKey === "custom") return dateInput.value;
      return DUE_PRESETS.find((p) => p.key === selectedKey).date();
    },
    reset() {
      dateInput.value = "";
      select("none");
    },
  };
}

// ----- 링크 도우미 -----

// 사용자가 쓴 주소를 안전한 http/https 주소로 바꿔요. 비어 있으면 "", 잘못되면 null.
function normalizeLink(raw) {
  const value = raw.trim();
  if (!value) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function hostOf(href) {
  return new URL(href).hostname.replace(/^www\./, "");
}

function isMusicLink(href) {
  const host = hostOf(href);
  return MUSIC_SITES.some((site) => host === site || host.endsWith("." + site));
}

// ----- Supabase 저장 -----
// config.js의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY로 todos 표(오노추는 songs 표)를 읽고 써요.

const REST_URL = `${SUPABASE_URL}/rest/v1/`;

// 표에 요청을 보내고, 바뀐 줄들을 배열로 돌려받아요. 실패하면 오류를 던져요.
async function request(method, query = "", body, table = "todos") {
  let response;
  try {
    response = await fetch(REST_URL + table + query, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("인터넷 연결을 확인해 주세요");
  }
  if (!response.ok) {
    let detail = `오류 코드 ${response.status}`;
    try {
      const data = await response.json();
      if (data.message) detail += ` · ${data.message}`;
    } catch {}
    throw new Error(detail);
  }
  return response.json();
}

// 표의 빈 칸(null)은 앱에서 빈 글자("")로 다뤄요
function fromRow(row) {
  return { ...row, due: row.due ?? "", link: row.link ?? "", author: row.author ?? "" };
}

function toRow(todo) {
  const row = { ...todo };
  if ("due" in row) row.due = row.due || null;
  if ("link" in row) row.link = row.link || null;
  if ("author" in row) row.author = row.author || null;
  return row;
}

function idsQuery(ids) {
  return `?id=in.(${[...ids].join(",")})`;
}

// 지금 남아 있는 오류들. 어떤 일에서 난 오류인지(key)마다 문구 하나씩 기억해요.
// key: "todos-load"(할 일 불러오기), "todos"(할 일 저장), "songs-load"(노래 목록 불러오기), "songs"(노래 저장)
const dbErrors = new Map();

function showDbErrors() {
  dbError.textContent = [...dbErrors.values()].join("\n");
  dbError.hidden = dbErrors.size === 0;
}

// 저장 작업을 실행하고, 실패하면 화면 위쪽에 오류를 보여 줘요. 성공하면 true.
// 성공하면 같은 key의 오류만 지워요. 다른 일에서 난 오류는 그대로 남아요.
async function save(action, work, key = "todos") {
  try {
    await work();
    dbErrors.delete(key);
    showDbErrors();
    return true;
  } catch (error) {
    dbErrors.set(key, `${action} 못했어요. (${error.message})`);
    showDbErrors();
    return false;
  }
}

async function loadTodos() {
  await save("할 일을 불러오지", async () => {
    const rows = await request("GET", "?select=*&order=created_at.asc,id.asc");
    todos = rows.map(fromRow);
  }, "todos-load");
  loading = false;
  render();
}

// 마지막 메모 다음 색을 골라요
function nextColor() {
  const last = todos[todos.length - 1];
  if (!last) return COLORS[0];
  return COLORS[(COLORS.indexOf(last.color) + 1) % COLORS.length];
}

// ----- 화면 그리기 -----

// 마감이 가까운 순서. 마감일이 없으면 맨 아래로 가고, 마감일이 같으면 추가한 순서를 지켜요.
function byDue(a, b) {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : 1;
}

function visibleTodos() {
  let shown = todos;
  if (filter === "active") shown = todos.filter((t) => !t.done);
  if (filter === "done") shown = todos.filter((t) => t.done);
  return [...shown].sort(byDue);
}

function createViewNote(todo) {
  const note = document.createElement("article");

  const text = document.createElement("p");
  text.className = "note-text";
  text.textContent = todo.text;
  text.title = "더블클릭하면 수정할 수 있어요";
  text.addEventListener("dblclick", () => startEdit(todo.id));

  const main = document.createElement("div");
  main.className = "note-main";
  main.appendChild(text);
  if (todo.author) {
    const author = document.createElement("p");
    author.className = "note-author";
    author.textContent = `— ${todo.author}`;
    main.appendChild(author);
  }
  note.appendChild(main);

  if (todo.due || todo.link) {
    const tags = document.createElement("div");
    tags.className = "note-tags";

    if (todo.due) {
      const { text: dueText, level } = describeDue(todo.due);
      const due = document.createElement("span");
      due.className = "due-tag";
      if (level && !todo.done) due.classList.add(level);
      due.textContent = dueText;
      tags.appendChild(due);
    }

    if (todo.link) {
      const link = document.createElement("a");
      link.className = "note-link";
      link.href = todo.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = todo.link;
      link.textContent = (isMusicLink(todo.link) ? "🎵 " : "🔗 ") + hostOf(todo.link);
      tags.appendChild(link);
    }

    note.appendChild(tags);
  }

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const checkLabel = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.done;
  checkbox.addEventListener("change", async () => {
    const done = checkbox.checked;
    await save("완료 표시를 저장하지", async () => {
      await request("PATCH", `?id=eq.${todo.id}`, { done });
      todo.done = done;
    });
    // 실패하면 체크 상태가 원래대로 돌아가요
    render();
  });
  checkLabel.append(checkbox, todo.done ? "완료!" : "완료");

  const buttons = document.createElement("div");

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.textContent = "✏️";
  editBtn.title = "수정";
  editBtn.addEventListener("click", () => startEdit(todo.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "icon-btn delete";
  deleteBtn.textContent = "✕";
  deleteBtn.title = "삭제";
  deleteBtn.addEventListener("click", async () => {
    await save("메모를 지우지", async () => {
      await request("DELETE", `?id=eq.${todo.id}`);
      todos = todos.filter((t) => t.id !== todo.id);
    });
    render();
  });

  buttons.append(editBtn, deleteBtn);
  actions.append(checkLabel, buttons);
  note.appendChild(actions);

  return note;
}

function createEditNote(todo) {
  const note = document.createElement("article");
  const form = document.createElement("form");
  form.className = "edit-form";

  const textField = document.createElement("input");
  textField.type = "text";
  textField.value = todo.text;
  textField.placeholder = "할 일";

  const linkField = document.createElement("input");
  linkField.type = "url";
  linkField.value = todo.link;
  linkField.placeholder = "링크 (선택)";

  const authorField = document.createElement("input");
  authorField.type = "text";
  authorField.value = todo.author;
  authorField.placeholder = "이름 (선택)";
  authorField.maxLength = 20;

  const duePicker = createDuePicker(todo.due);

  const error = document.createElement("p");
  error.className = "error";
  error.hidden = true;

  const buttons = document.createElement("div");
  buttons.className = "edit-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "cancel-btn";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => {
    editingId = null;
    render();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "save-btn";
  saveBtn.textContent = "저장";

  buttons.append(cancelBtn, saveBtn);
  form.append(textField, linkField, authorField, duePicker.element, error, buttons);

  // 브라우저 기본 주소 검사 대신 normalizeLink로 검사해요 (예: "youtube.com"도 허용)
  form.noValidate = true;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textField.value.trim();
    const link = normalizeLink(linkField.value);
    if (!text) {
      error.textContent = "할 일을 입력해 주세요.";
      error.hidden = false;
      return;
    }
    if (link === null) {
      error.textContent = "링크 주소가 올바르지 않아요.";
      error.hidden = false;
      return;
    }
    const changes = { text, due: duePicker.getValue(), link, author: authorField.value.trim() };
    saveBtn.disabled = true;
    const ok = await save("수정한 내용을 저장하지", async () => {
      await request("PATCH", `?id=eq.${todo.id}`, toRow(changes));
      Object.assign(todo, changes);
    });
    saveBtn.disabled = false;
    // 실패하면 고치던 내용이 사라지지 않게 수정 칸을 그대로 둬요
    if (!ok) return;
    editingId = null;
    render();
  });

  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      editingId = null;
      render();
    }
  });

  note.appendChild(form);
  setTimeout(() => textField.focus(), 0);
  return note;
}

function startEdit(id) {
  editingId = id;
  render();
}

function render() {
  board.innerHTML = "";

  for (const todo of visibleTodos()) {
    const note = todo.id === editingId ? createEditNote(todo) : createViewNote(todo);
    note.classList.add("note", todo.color);
    if (todo.done) note.classList.add("done");
    if (selecting) {
      note.classList.add("selectable");
      note.classList.toggle("selected", selectedIds.has(todo.id));
      note.addEventListener("click", () => toggleSelected(todo.id));
    }
    board.appendChild(note);
  }

  const doneCount = todos.filter((t) => t.done).length;
  const shownCount = visibleTodos().length;

  normalTools.hidden = selecting;
  selectTools.hidden = !selecting;
  selectModeBtn.disabled = todos.length === 0;
  if (selecting) {
    const allSelected = shownCount > 0 && visibleTodos().every((t) => selectedIds.has(t.id));
    selectCount.textContent = `${selectedIds.size}개 선택됨`;
    selectAllBtn.textContent = allSelected ? "선택 해제" : "모두 선택";
    deleteSelectedBtn.disabled = selectedIds.size === 0;
  }

  if (loading) {
    empty.textContent = "할 일을 불러오는 중이에요…";
  } else if (todos.length === 0) {
    empty.textContent = "아직 메모가 없어요. 위에서 할 일을 추가해 보세요.";
  } else if (shownCount === 0) {
    empty.textContent = filter === "done" ? "완료한 메모가 없어요." : "진행 중인 메모가 없어요. 다 끝냈네요! 🎉";
  }
  empty.hidden = shownCount > 0;

  summary.textContent = `남은 할 일 ${todos.length - doneCount}개 · 완료 ${doneCount}개 · 전체 ${todos.length}개`;
  clearDoneBtn.disabled = doneCount === 0;

  filterButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
}

// ----- 추가 / 필터 / 일괄 삭제 -----

const addDuePicker = createDuePicker();
document.getElementById("add-due").appendChild(addDuePicker.element);

addForm.noValidate = true;
addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  const link = normalizeLink(linkInput.value);

  if (!text) {
    addError.textContent = "할 일을 입력해 주세요.";
    addError.hidden = false;
    textInput.focus();
    return;
  }
  if (link === null) {
    addError.textContent = "링크 주소가 올바르지 않아요. 예: https://www.youtube.com/...";
    addError.hidden = false;
    linkInput.focus();
    return;
  }

  addError.hidden = true;
  addButton.disabled = true;
  const ok = await save("할 일을 추가하지", async () => {
    const newTodo = { text, due: addDuePicker.getValue(), link, author: authorInput.value.trim(), color: nextColor() };
    const [row] = await request("POST", "", toRow(newTodo));
    todos.push(fromRow(row));
  });
  addButton.disabled = false;
  // 실패하면 적어 둔 내용을 지우지 않아요
  if (!ok) return;

  textInput.value = "";
  linkInput.value = "";
  addDuePicker.reset();
  textInput.focus();
  render();
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    // 화면에 안 보이는 메모가 선택된 채로 지워지지 않게 선택을 비워요
    selectedIds.clear();
    render();
  });
});

// ----- 여러 개 선택 -----

function toggleSelected(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

function exitSelecting() {
  selecting = false;
  selectedIds.clear();
  render();
}

selectModeBtn.addEventListener("click", () => {
  selecting = true;
  editingId = null;
  selectedIds.clear();
  render();
});

selectAllBtn.addEventListener("click", () => {
  const shown = visibleTodos();
  const allSelected = shown.every((t) => selectedIds.has(t.id));
  selectedIds = allSelected ? new Set() : new Set(shown.map((t) => t.id));
  render();
});

deleteSelectedBtn.addEventListener("click", async () => {
  const ids = new Set(selectedIds);
  const ok = await save("선택한 메모를 지우지", async () => {
    await request("DELETE", idsQuery(ids));
    todos = todos.filter((t) => !ids.has(t.id));
  });
  // 실패하면 선택을 그대로 두고 다시 시도할 수 있게 해요
  if (ok) exitSelecting();
  else render();
});

selectDoneBtn.addEventListener("click", exitSelecting);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selecting) exitSelecting();
});

clearDoneBtn.addEventListener("click", async () => {
  const ids = new Set(todos.filter((t) => t.done).map((t) => t.id));
  await save("완료한 메모를 지우지", async () => {
    await request("DELETE", idsQuery(ids));
    todos = todos.filter((t) => !ids.has(t.id));
  });
  render();
});

// ----- 왼쪽 위 LP -----

// LP 가운데에 칠할 수 있는 색. 첫 번째가 처음 색이고, 화살표는 이 순서대로 넘겨요.
const LP_COLORS = [
  // 차분한 색
  { name: "베이지", value: "#b89b7a" },
  { name: "크림", value: "#eadcb8" },
  { name: "하양", value: "#f6f2ea" },
  { name: "살구", value: "#e8b796" },
  { name: "장미", value: "#d9999b" },
  { name: "라벤더", value: "#b6a7d8" },
  { name: "하늘", value: "#9fc3dc" },
  { name: "청록", value: "#8fbcb7" },
  { name: "민트", value: "#a6d1b7" },
  { name: "올리브", value: "#a8ab78" },
  // 고급스러운 색
  { name: "버건디", value: "#7b2232" },
  { name: "와인", value: "#5c1a2b" },
  { name: "마호가니", value: "#6e3426" },
  { name: "플럼", value: "#5b2d50" },
  { name: "로즈골드", value: "#c48f80" },
  { name: "샴페인", value: "#e2cc9f" },
  { name: "골드", value: "#c6a148" },
  { name: "에메랄드", value: "#1f6650" },
  { name: "포레스트", value: "#2e4a37" },
  { name: "네이비", value: "#1f2e52" },
];

let lpIndex = 0;

const lpSwatches = LP_COLORS.map((color, index) => {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = "lp-swatch";
  swatch.style.background = color.value;
  swatch.title = color.name;
  swatch.setAttribute("aria-label", `LP 가운데 색: ${color.name}`);
  swatch.addEventListener("click", () => {
    setLpColor(index);
    toggleLpPalette(false);
  });
  lpPalette.appendChild(swatch);
  return swatch;
});

// LP_COLORS의 index번째 색으로 칠해요. 끝을 넘으면 반대쪽 끝으로 돌아가요.
function setLpColor(index) {
  lpIndex = (index + LP_COLORS.length) % LP_COLORS.length;
  const color = LP_COLORS[lpIndex];
  lp.style.setProperty("--lp-color", color.value);
  lp.title = `지금 색: ${color.name} · 눌러서 색 고르기`;
  lpSwatches.forEach((s, i) => s.classList.toggle("selected", i === lpIndex));
}

lpPrev.addEventListener("click", () => setLpColor(lpIndex - 1));
lpNext.addEventListener("click", () => setLpColor(lpIndex + 1));

function toggleLpPalette(open) {
  lpPalette.hidden = !open;
  lp.setAttribute("aria-expanded", String(open));
}

lp.addEventListener("click", () => toggleLpPalette(lpPalette.hidden));

// 색 버튼 모음 바깥을 누르거나 Esc를 누르면 닫아요
document.addEventListener("click", (event) => {
  if (!lpWrap.contains(event.target)) toggleLpPalette(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") toggleLpPalette(false);
});

setLpColor(0);

// ----- 오노추: Y2K MP3 플레이어 -----
// 노래 목록은 Supabase songs 표에 저장하고, 재생은 YouTube 플레이어, 가사는 LRCLIB(무료 가사 서비스)에서 가져와요.
// YouTube는 더블클릭으로 연 페이지(file://)에서 재생을 막아서, 듣기는 열기.cmd로 열었을 때만 돼요.

const mp3 = document.getElementById("mp3");
const mp3Song = document.getElementById("mp3-song");
const mp3Lyric = document.getElementById("mp3-lyric");
const mp3LyricText = document.getElementById("mp3-lyric-text");
const mp3LyricNext = document.getElementById("mp3-lyric-next");
const mp3Bar = document.getElementById("mp3-bar");
const mp3Now = document.getElementById("mp3-now");
const mp3Total = document.getElementById("mp3-total");
const mp3Play = document.getElementById("mp3-play");
const mp3PrevBtn = document.getElementById("mp3-prev");
const mp3NextBtn = document.getElementById("mp3-next");
const mp3ListBtn = document.getElementById("mp3-list-btn");
const mp3Panel = document.getElementById("mp3-panel");
const mp3List = document.getElementById("mp3-list");
const songForm = document.getElementById("song-form");
const songLink = document.getElementById("song-link");
const songTitle = document.getElementById("song-title");
const songArtist = document.getElementById("song-artist");
const songError = document.getElementById("song-error");
const songAddBtn = songForm.querySelector(".song-add-btn");

let songs = [];
let songIndex = -1; // 지금 고른 노래가 songs의 몇 번째인지 (-1이면 아직 안 고름)
let player = null; // YouTube 플레이어
let playerReady = null; // 플레이어 준비를 기다리는 Promise
let playing = false;
let lyrics = []; // 시간이 붙은 가사: [{ time: 초, text }]
let lyricsFor = null; // 지금 가사가 어느 노래(id) 것인지
let lyricsMessage = ""; // 가사 대신 화면에 보여 줄 말 (찾는 중, 못 찾음, 오류)
let lyricsToken = 0; // 노래를 빨리 넘겼을 때 늦게 도착한 가사를 버리려고 써요
let infoToken = 0;

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// YouTube 링크에서 영상 번호(11자)를 꺼내요. YouTube 링크가 아니면 null.
function youTubeId(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com") {
    id = url.searchParams.get("v");
    const match = url.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
    if (!id && match) id = match[2];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

// YouTube 영상 제목에서 노래 제목과 만든 사람을 짐작해요. 틀리면 직접 고치면 돼요.
function guessSong(videoTitle, channel) {
  const title = videoTitle
    .replace(/\[[^\]]*\]|【[^】]*】/g, " ")
    .replace(/\([^)]*(official|music video|m\/v|\bmv\b|lyrics?|audio|visuali[sz]er|remaster(ed)?|4k|hd|가사|뮤직비디오)[^)]*\)/gi, " ")
    .replace(/\b(official\s+)?(music\s+video|m\/v|mv)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "가수 - 제목" 모양
  const parts = title.split(/\s+[-–—_|]\s+/);
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  // "가수 '제목'" 모양
  const quoted = title.match(/^(.+?)\s*['‘"“]([^'’"”]+)['’"”]/);
  if (quoted) return { artist: quoted[1].trim(), title: quoted[2].trim() };
  return { artist: channel.replace(/\s*-\s*Topic$|VEVO$|\s+official$/i, "").trim(), title };
}

async function fetchVideoInfo(href) {
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(href)}`);
  if (!response.ok) throw new Error(`오류 코드 ${response.status}`);
  return response.json();
}

// 링크를 넣으면 노래 제목과 만든 사람 칸을 자동으로 채워요 (비어 있는 칸만)
async function fillSongInfo() {
  const href = normalizeLink(songLink.value);
  if (!href || !youTubeId(href)) return;
  const token = ++infoToken;
  try {
    const info = await fetchVideoInfo(href);
    if (token !== infoToken) return;
    const guess = guessSong(info.title, info.author_name);
    if (!songTitle.value.trim()) songTitle.value = guess.title;
    if (!songArtist.value.trim()) songArtist.value = guess.artist;
  } catch {
    // 정보를 못 가져와도 직접 적으면 돼요
  }
}

// "[01:23.45] 가사" 모양의 줄들을 [{ time, text }]로 바꿔요
function parseLrc(text) {
  const lines = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (match) lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim() });
  }
  return lines;
}

async function searchLyrics(params) {
  const response = await fetch(`https://lrclib.net/api/search?${new URLSearchParams(params)}`);
  if (!response.ok) return [];
  return response.json();
}

// 시간이 붙은 가사를 찾아요. 여러 개면 영상 길이와 가장 비슷한 걸 골라요.
async function findLyrics(song, duration) {
  const shortTitle = song.title.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const tries = [];
  if (song.artist) tries.push({ track_name: song.title, artist_name: song.artist });
  tries.push({ q: `${song.artist || ""} ${song.title}`.trim() });
  if (shortTitle && shortTitle !== song.title) tries.push({ q: `${song.artist || ""} ${shortTitle}`.trim() });
  tries.push({ q: song.title });

  for (const params of tries) {
    const results = (await searchLyrics(params)).filter((r) => r.syncedLyrics);
    if (results.length === 0) continue;
    if (duration) results.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
    return parseLrc(results[0].syncedLyrics);
  }
  return [];
}

async function loadLyrics(song, duration) {
  lyricsFor = song.id;
  const token = ++lyricsToken;
  lyrics = [];
  lyricsMessage = "가사를 찾는 중…";
  let found = [];
  try {
    found = await findLyrics(song, duration);
  } catch {
    // 가사 서비스에 연결하지 못하면 못 찾은 것으로 해요
  }
  if (token !== lyricsToken) return;
  lyrics = found;
  lyricsMessage = found.length ? "" : "가사를 찾지 못했어요";
}

function showMessage(message) {
  lyrics = [];
  lyricsMessage = message;
  showLyrics(0);
}

// 지금 가사 줄을 바꿔요. 줄이 바뀌면 밀려 있던 글자를 애니메이션 없이 처음 자리로 돌려놔요.
function setLyricText(text) {
  if (mp3LyricText.textContent === text) return;
  mp3LyricText.style.transition = "none";
  mp3LyricText.style.transform = "translateX(0)";
  mp3LyricText.textContent = text;
  void mp3LyricText.offsetWidth; // 브라우저가 처음 자리를 먼저 그리게 해요
  mp3LyricText.style.transition = "";
}

// 화면보다 긴 가사 줄은 부르는 동안 왼쪽으로 밀어서 끝까지 보여 줘요.
// 줄의 처음 15%는 멈춰 있다가, 70% 동안 천천히 밀리고, 마지막 15%는 끝부분에 멈춰 있어요.
function slideLyric(progress) {
  const overflow = mp3LyricText.offsetWidth - mp3Lyric.clientWidth;
  const amount = Math.min(1, Math.max(0, (progress - 0.15) / 0.7));
  mp3LyricText.style.transform = overflow > 0 ? `translateX(${-overflow * amount}px)` : "translateX(0)";
}

// 재생 시간에 맞는 가사 줄과 그다음 줄을 보여 줘요
function showLyrics(now) {
  if (lyricsMessage) {
    setLyricText(lyricsMessage);
    // 메시지는 부르는 시간이 없으니 6초마다 한 번씩 밀었다가 돌아와요
    slideLyric(((Date.now() / 1000) % 6) / 6);
    setText(mp3LyricNext, "");
    return;
  }
  let i = -1;
  while (i + 1 < lyrics.length && lyrics[i + 1].time <= now + 0.2) i++;
  setLyricText(i >= 0 ? lyrics[i].text || "♪" : "♪ ♫ ♪");
  setText(mp3LyricNext, lyrics[i + 1]?.text || "");

  // 이 줄을 부르는 시간: 다음 줄이 시작할 때까지 (마지막 줄은 5초로 봐요)
  if (i >= 0) {
    const start = lyrics[i].time;
    const end = lyrics[i + 1]?.time ?? start + 5;
    slideLyric((now - start) / Math.max(0.5, end - start));
  } else {
    slideLyric(0);
  }
}

function tick() {
  const now = (player && player.getCurrentTime && player.getCurrentTime()) || 0;
  const total = (player && player.getDuration && player.getDuration()) || 0;
  setText(mp3Now, formatTime(now));
  setText(mp3Total, formatTime(total));
  mp3Bar.style.width = total ? `${Math.min(100, (now / total) * 100)}%` : "0";
  showLyrics(now);
}

function updateSongInfo() {
  const song = songs[songIndex];
  let text = songs.length === 0 ? "노래를 추가해 보세요 ☰" : "▶ play를 눌러 들어 보세요";
  if (song) text = song.artist ? `${song.title} — ${song.artist}` : song.title;
  setText(mp3Song, text);
  mp3Play.textContent = playing ? "❚❚ pause" : "▶ play";
}

function renderSongs() {
  mp3List.innerHTML = "";
  if (songs.length === 0) {
    const li = document.createElement("li");
    li.className = "mp3-list-empty";
    li.textContent = "아직 노래가 없어요. 아래에서 추가해 보세요.";
    mp3List.appendChild(li);
    return;
  }
  songs.forEach((song, index) => {
    const li = document.createElement("li");

    const songBtn = document.createElement("button");
    songBtn.type = "button";
    songBtn.className = "mp3-song-btn";
    songBtn.classList.toggle("playing", index === songIndex);
    songBtn.textContent = `${index === songIndex ? "▶ " : ""}${song.title}`;
    if (song.artist) {
      const artist = document.createElement("span");
      artist.className = "artist";
      artist.textContent = ` — ${song.artist}`;
      songBtn.appendChild(artist);
    }
    songBtn.title = "눌러서 듣기";
    songBtn.addEventListener("click", () => playSong(index));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "목록에서 지우기";
    deleteBtn.addEventListener("click", () => deleteSong(song));

    li.append(songBtn, deleteBtn);
    mp3List.appendChild(li);
  });
}

// YouTube 플레이어를 처음 한 번만 준비해요
function loadPlayer() {
  if (playerReady) return playerReady;
  playerReady = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player("yt-player", {
        width: 200,
        height: 200,
        playerVars: { playsinline: 1, controls: 0, disablekb: 1 },
        events: {
          onReady: () => resolve(player),
          onStateChange: onPlayerState,
          onError: onPlayerError,
        },
      });
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      playerReady = null;
      reject(new Error("YouTube에 연결하지 못했어요"));
    };
    document.head.appendChild(script);
  });
  return playerReady;
}

function onPlayerState(event) {
  const song = songs[songIndex];
  if (event.data === YT.PlayerState.PLAYING) {
    playing = true;
    if (song && lyricsFor !== song.id) loadLyrics(song, player.getDuration());
  } else if (event.data === YT.PlayerState.PAUSED) {
    playing = false;
  } else if (event.data === YT.PlayerState.ENDED) {
    playing = false;
    // 다 들으면 다음 노래로 넘어가요
    if (songs.length > 1) playSong(songIndex + 1);
  }
  updateSongInfo();
}

function onPlayerError(event) {
  const messages = {
    2: "링크가 올바르지 않아요",
    5: "재생할 수 없는 영상이에요",
    100: "지워졌거나 비공개인 영상이에요",
    101: "다른 곳에서 재생을 막아 둔 영상이에요",
    150: "다른 곳에서 재생을 막아 둔 영상이에요",
    153: "열기.cmd로 열어야 들을 수 있어요",
  };
  playing = false;
  updateSongInfo();
  showMessage(`⚠ ${messages[event.data] || "재생하지 못했어요"}`);
}

async function playSong(index) {
  if (songs.length === 0) return;
  if (location.protocol === "file:") {
    showMessage("▶ 듣기는 열기.cmd로 열었을 때만 돼요");
    return;
  }
  songIndex = (index + songs.length) % songs.length;
  const song = songs[songIndex];
  lyricsFor = null;
  lyricsToken++;
  showMessage("노래를 불러오는 중…");
  updateSongInfo();
  renderSongs();
  try {
    await loadPlayer();
  } catch (error) {
    showMessage(`⚠ ${error.message}`);
    return;
  }
  player.loadVideoById(youTubeId(song.url));
}

function stopPlayer() {
  if (player && player.stopVideo) player.stopVideo();
  playing = false;
  songIndex = -1;
  lyricsFor = null;
  lyricsToken++;
  showMessage("");
}

async function loadSongs() {
  await save("노래 목록을 불러오지", async () => {
    songs = await request("GET", "?select=*&order=created_at.asc,id.asc", undefined, "songs");
  }, "songs-load");
  renderSongs();
  updateSongInfo();
}

async function deleteSong(song) {
  const ok = await save("노래를 지우지", async () => {
    await request("DELETE", `?id=eq.${song.id}`, undefined, "songs");
  }, "songs");
  if (!ok) return;
  const removed = songs.indexOf(song);
  songs = songs.filter((s) => s !== song);
  if (removed === songIndex) stopPlayer();
  else if (removed < songIndex) songIndex--;
  renderSongs();
  updateSongInfo();
}

function toggleMp3Panel(open) {
  mp3Panel.hidden = !open;
  mp3ListBtn.setAttribute("aria-expanded", String(open));
}

mp3Play.addEventListener("click", () => {
  if (songs.length === 0) {
    toggleMp3Panel(true);
    songLink.focus();
    return;
  }
  if (songIndex < 0 || !player) {
    playSong(Math.max(songIndex, 0));
  } else if (playing) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
});

mp3PrevBtn.addEventListener("click", () => playSong(songIndex - 1));
mp3NextBtn.addEventListener("click", () => playSong(songIndex + 1));
mp3ListBtn.addEventListener("click", () => toggleMp3Panel(mp3Panel.hidden));

// 노래 목록 바깥을 누르거나 Esc를 누르면 닫아요
document.addEventListener("click", (event) => {
  if (!mp3.contains(event.target)) toggleMp3Panel(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") toggleMp3Panel(false);
});

songLink.addEventListener("change", fillSongInfo);
songLink.addEventListener("paste", () => setTimeout(fillSongInfo, 0));

songForm.noValidate = true;
songForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const href = normalizeLink(songLink.value);
  const title = songTitle.value.trim();
  const artist = songArtist.value.trim();

  if (!href || !youTubeId(href)) {
    songError.textContent = "YouTube 노래 링크를 넣어 주세요. 예: https://youtu.be/...";
    songError.hidden = false;
    songLink.focus();
    return;
  }
  if (!title) {
    songError.textContent = "노래 제목을 적어 주세요.";
    songError.hidden = false;
    songTitle.focus();
    return;
  }

  songError.hidden = true;
  songAddBtn.disabled = true;
  const ok = await save("노래를 추가하지", async () => {
    const [row] = await request("POST", "", { url: href, title, artist: artist || null }, "songs");
    songs.push(row);
  }, "songs");
  songAddBtn.disabled = false;
  if (!ok) return;
  songForm.reset();
  renderSongs();
  updateSongInfo();
});

setInterval(tick, 250);
renderSongs();
updateSongInfo();

render();
loadTodos();
loadSongs();
