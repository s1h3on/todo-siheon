const COLORS = ["white", "ivory", "cream", "linen", "sand"];
const MUSIC_SITES = ["youtube.com", "youtu.be", "music.youtube.com", "spotify.com", "melon.com", "genie.co.kr", "soundcloud.com", "music.apple.com"];

const addForm = document.getElementById("add-form");
const textInput = document.getElementById("text-input");
const linkInput = document.getElementById("link-input");
const addError = document.getElementById("add-error");
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

let todos = [];
let nextId = 1;
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

// ----- 화면 그리기 -----

function visibleTodos() {
  if (filter === "active") return todos.filter((t) => !t.done);
  if (filter === "done") return todos.filter((t) => t.done);
  return todos;
}

function createViewNote(todo) {
  const note = document.createElement("article");

  const text = document.createElement("p");
  text.className = "note-text";
  text.textContent = todo.text;
  text.title = "더블클릭하면 수정할 수 있어요";
  text.addEventListener("dblclick", () => startEdit(todo.id));
  note.appendChild(text);

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
  checkbox.addEventListener("change", () => {
    todo.done = checkbox.checked;
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
  deleteBtn.addEventListener("click", () => {
    todos = todos.filter((t) => t.id !== todo.id);
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
  form.append(textField, linkField, duePicker.element, error, buttons);

  // 브라우저 기본 주소 검사 대신 normalizeLink로 검사해요 (예: "youtube.com"도 허용)
  form.noValidate = true;
  form.addEventListener("submit", (event) => {
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
    todo.text = text;
    todo.due = duePicker.getValue();
    todo.link = link;
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

  if (todos.length === 0) {
    empty.textContent = "아직 메모가 없어요. 위에서 할 일을 추가해 보세요.";
  } else if (shownCount === 0) {
    empty.textContent = filter === "done" ? "완료한 메모가 없어요." : "진행 중인 메모가 없어요. 다 끝냈네요! 🎉";
  }
  empty.hidden = shownCount > 0;

  summary.textContent = `전체 ${todos.length}개 · 완료 ${doneCount}개`;
  clearDoneBtn.disabled = doneCount === 0;

  filterButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
}

// ----- 추가 / 필터 / 일괄 삭제 -----

const addDuePicker = createDuePicker();
document.getElementById("add-due").appendChild(addDuePicker.element);

addForm.noValidate = true;
addForm.addEventListener("submit", (event) => {
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

  todos.push({
    id: nextId,
    text,
    due: addDuePicker.getValue(),
    link,
    done: false,
    color: COLORS[(nextId - 1) % COLORS.length],
  });
  nextId++;

  addError.hidden = true;
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

deleteSelectedBtn.addEventListener("click", () => {
  todos = todos.filter((t) => !selectedIds.has(t.id));
  exitSelecting();
});

selectDoneBtn.addEventListener("click", exitSelecting);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && selecting) exitSelecting();
});

clearDoneBtn.addEventListener("click", () => {
  todos = todos.filter((t) => !t.done);
  render();
});

render();
