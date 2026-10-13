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
// config.js의 SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY로 todos 표를 읽고 써요.

const TODOS_URL = `${SUPABASE_URL}/rest/v1/todos`;

// 표에 요청을 보내고, 바뀐 줄들을 배열로 돌려받아요. 실패하면 오류를 던져요.
async function request(method, query = "", body) {
  let response;
  try {
    response = await fetch(TODOS_URL + query, {
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

// 저장 작업을 실행하고, 실패하면 화면 위쪽에 오류를 보여 줘요. 성공하면 true.
async function save(action, work) {
  try {
    await work();
    dbError.hidden = true;
    return true;
  } catch (error) {
    dbError.textContent = `${action} 못했어요. (${error.message})`;
    dbError.hidden = false;
    return false;
  }
}

async function loadTodos() {
  await save("할 일을 불러오지", async () => {
    const rows = await request("GET", "?select=*&order=created_at.asc,id.asc");
    todos = rows.map(fromRow);
  });
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

render();
loadTodos();
