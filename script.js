// ==========================================================================
// Grimoire de Tâches — logique de l'application
// Stockage local (localStorage), pas de dépendances externes.
// Vues : Liste, Kanban (À commencer / En cours / Terminé), Calendrier.
// ==========================================================================

const STORAGE_KEY = "grimoire-taches.v2";
const LEGACY_STORAGE_KEY = "grimoire-taches.v1";
const PROJECTS_STORAGE_KEY = "grimoire-taches.projects";
const VIEW_STORAGE_KEY = "grimoire-taches.view";
const THEME_STORAGE_KEY = "grimoire-taches.theme";

const VIEWS = ["list", "kanban", "calendar", "project"];

const STATUSES = ["todo", "doing", "done"];
const STATUS_LABEL = { todo: "À commencer", doing: "En cours", done: "Terminé" };
const PRIORITY_LABEL = { low: "Fond", medium: "Todo", high: "Urgent" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

/** @typedef {{id: string, text: string, done: boolean}} Subtask */
/** @typedef {{id: string, text: string, priority: "low"|"medium"|"high", status: "todo"|"doing"|"done", dueDate: string|null, description: string, subtasks: Subtask[], createdAt: number, projectId: string|null}} Task */
/** @typedef {{id: string, name: string, description: string, sortMode: "manual"|"due"|"priority", taskOrder: string[], createdAt: number}} Project */

/** @type {Task[]} */
let tasks = loadTasks();
/** @type {Project[]} */
let projects = loadProjects();
let currentFilter = "active"; // vue Liste : "active" | "done"
let currentGroupBy = "none"; // vue Liste : "none" | "category" | "due" | "created"
let currentSort = "recent"; // vue Liste : "recent" | "due" | "priority"
let currentView = loadView(); // "list" | "kanban" | "calendar" | "project"

const KANBAN_PAGE_SIZE = 5;
let kanbanExpanded = { todo: false, doing: false, done: false };

const today = new Date();
let calendarCursor = { year: today.getFullYear(), month: today.getMonth() };
let selectedDate = toDateStr(today);

// ---- DOM refs ----
const quickAddPanel = document.getElementById("quick-add-panel");
const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const themeToggleBtn = document.getElementById("theme-toggle");

const viewNav = document.getElementById("view-nav");
const viewSections = {
  list: document.getElementById("view-list"),
  kanban: document.getElementById("view-kanban"),
  calendar: document.getElementById("view-calendar"),
  project: document.getElementById("view-project"),
};

// Vue Liste
const list = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const filtersEl = document.getElementById("filters");
const groupSelectEl = document.getElementById("group-select");
const sortSelectEl = document.getElementById("sort-select");

// Vue Kanban
const kanbanLists = {
  todo: document.getElementById("kanban-todo"),
  doing: document.getElementById("kanban-doing"),
  done: document.getElementById("kanban-done"),
};
const kanbanCounts = {
  todo: document.getElementById("count-todo"),
  doing: document.getElementById("count-doing"),
  done: document.getElementById("count-done"),
};

// Vue Calendrier
const calGrid = document.getElementById("calendar-grid");
const calMonthLabel = document.getElementById("cal-month-label");
const calPrevBtn = document.getElementById("cal-prev");
const calNextBtn = document.getElementById("cal-next");
const calTodayBtn = document.getElementById("cal-today");
const agendaTitle = document.getElementById("agenda-title");
const agendaList = document.getElementById("agenda-list");
const agendaEmpty = document.getElementById("agenda-empty");

// Vue Projets
const projectForm = document.getElementById("project-form");
const projectInput = document.getElementById("project-input");
const projectListEl = document.getElementById("project-list");
const projectEmptyState = document.getElementById("project-empty-state");

// Modale d'édition de projet
const projectModalBackdrop = document.getElementById("project-modal-backdrop");
const projectModalTitleInput = document.getElementById("project-modal-title-input");
const projectModalDescInput = document.getElementById("project-modal-desc-input");
const projectModalCloseBtn = document.getElementById("project-modal-close");
const projectModalCancelBtn = document.getElementById("project-modal-cancel");
const projectModalSaveBtn = document.getElementById("project-modal-save");
const projectModalDeleteBtn = document.getElementById("project-modal-delete");

// Modale d'édition de tâche
const modalBackdrop = document.getElementById("task-modal-backdrop");
const modal = document.getElementById("task-modal");
const modalTitleInput = document.getElementById("modal-title-input");
const modalPriorityInput = document.getElementById("modal-priority-input");
const modalDueInput = document.getElementById("modal-due-input");
const modalProjectInput = document.getElementById("modal-project-input");
const modalDescInput = document.getElementById("modal-desc-input");
const modalCloseBtn = document.getElementById("modal-close");
const modalCancelBtn = document.getElementById("modal-cancel");
const modalSaveBtn = document.getElementById("modal-save");
const modalDeleteBtn = document.getElementById("modal-delete");
const modalSubtaskList = document.getElementById("modal-subtask-list");
const modalSubtaskForm = document.getElementById("modal-subtask-form");
const modalSubtaskInput = document.getElementById("modal-subtask-input");
const modalSubtasksProgress = document.getElementById("modal-subtasks-progress");
const modalSubtasksBar = document.getElementById("modal-subtasks-bar");
const modalSubtasksFill = document.getElementById("modal-subtasks-fill");

// Paramètres
const settingsToggleBtn = document.getElementById("settings-toggle");
const settingsBackdrop = document.getElementById("settings-modal-backdrop");
const settingsCloseBtn = document.getElementById("settings-close");
const exportJsonBtn = document.getElementById("export-json-btn");
const importJsonBtn = document.getElementById("import-json-btn");
const importJsonInput = document.getElementById("import-json-input");
const importErrorEl = document.getElementById("import-error");

// Confirmation (générique : suppression de tâche, import JSON, …)
const confirmBackdrop = document.getElementById("confirm-backdrop");
const confirmText = document.getElementById("confirm-text");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
let pendingConfirmAction = null;

let editingTaskId = null;
let editingProjectId = null;

// ---- Persistence ----

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
    }
    // Migration depuis l'ancien schéma (booléen `done`)
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      const migrated = Array.isArray(legacy) ? legacy.map(normalizeTask) : [];
      // Écrit directement (plutôt que via saveTasks/`tasks`, encore non
      // initialisées tant que ce `let tasks = loadTasks()` n'a pas fini).
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch (saveErr) {
        console.warn("Impossible d'enregistrer la migration :", saveErr);
      }
      return migrated;
    }
    return [];
  } catch (err) {
    console.warn("Impossible de lire les tâches enregistrées :", err);
    return [];
  }
}

function normalizeTask(raw) {
  let status = raw.status;
  if (!STATUSES.includes(status)) {
    status = raw.done ? "done" : "todo";
  }
  return {
    id: raw.id ?? makeId(),
    text: String(raw.text ?? "").trim(),
    priority: ["low", "medium", "high"].includes(raw.priority) ? raw.priority : "medium",
    status,
    dueDate: raw.dueDate ?? null,
    description: String(raw.description ?? ""),
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map(normalizeSubtask) : [],
    createdAt: raw.createdAt ?? Date.now(),
    projectId: raw.projectId ?? null,
  };
}

function normalizeSubtask(raw) {
  return {
    id: raw?.id ?? makeId(),
    text: String(raw?.text ?? "").trim(),
    done: Boolean(raw?.done),
  };
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.warn("Impossible d'enregistrer les tâches :", err);
  }
}

function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeProject) : [];
  } catch (err) {
    console.warn("Impossible de lire les projets enregistrés :", err);
    return [];
  }
}

function normalizeProject(raw) {
  return {
    id: raw?.id ?? makeId(),
    name: String(raw?.name ?? "").trim(),
    description: String(raw?.description ?? ""),
    sortMode: ["manual", "due", "priority"].includes(raw?.sortMode) ? raw.sortMode : "manual",
    taskOrder: Array.isArray(raw?.taskOrder) ? raw.taskOrder.filter((id) => typeof id === "string") : [],
    createdAt: raw?.createdAt ?? Date.now(),
  };
}

function saveProjects() {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch (err) {
    console.warn("Impossible d'enregistrer les projets :", err);
  }
}

function loadView() {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return VIEWS.includes(saved) ? saved : "list";
  } catch {
    return "list";
  }
}

function saveView() {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
  } catch {
    /* ignore */
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---- Thème (clair / sombre) ----

function getTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // L'icône (soleil/lune) est basculée en CSS via [data-theme] — voir style.css.
  themeToggleBtn.setAttribute(
    "aria-label",
    theme === "light" ? "Passer en thème sombre" : "Passer en thème clair"
  );
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

function toggleTheme() {
  applyTheme(getTheme() === "light" ? "dark" : "light");
}

// ---- Paramètres ----

function openSettingsModal() {
  importErrorEl.hidden = true;
  settingsBackdrop.hidden = false;
}

function closeSettingsModal() {
  settingsBackdrop.hidden = true;
}

function showImportError(message) {
  importErrorEl.textContent = message;
  importErrorEl.hidden = false;
}

function exportTasksAsJson() {
  const dataStr = JSON.stringify(tasks, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `grimoire-taches-${toDateStr(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importTasksFromFile(file) {
  importErrorEl.hidden = true;

  const reader = new FileReader();
  reader.onerror = () => showImportError("Impossible de lire ce fichier.");
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      showImportError("Ce fichier n'est pas un JSON valide.");
      return;
    }
    if (!Array.isArray(parsed)) {
      showImportError("Ce fichier ne contient pas une liste de quêtes.");
      return;
    }

    const count = parsed.length;
    openConfirm({
      text: `Importer ${count} quête${count > 1 ? "s" : ""} ? Cela remplacera définitivement toutes les quêtes actuelles.`,
      confirmLabel: "Remplacer",
      onConfirm: () => {
        tasks = parsed.map(normalizeTask);
        saveTasks();
        render();
        closeSettingsModal();
      },
    });
  };
  reader.readAsText(file);
}

// ---- Dates ----

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateStr(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDueDate(str) {
  const date = parseDateStr(str);
  const formatted = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
  return formatted.replace(".", "");
}

function daysUntilDue(str) {
  const target = parseDateStr(str);
  const todayMidnight = parseDateStr(toDateStr(new Date()));
  return Math.round((target - todayMidnight) / 86400000);
}

function formatDaysRemaining(diffDays) {
  if (diffDays === 0) return "aujourd'hui";
  if (diffDays > 0) return `dans ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  const abs = Math.abs(diffDays);
  return `il y a ${abs} jour${abs > 1 ? "s" : ""}`;
}

// ---- Actions (données) ----

function addTask(text, projectId = null) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const task = {
    id: makeId(),
    text: trimmed,
    priority: "medium",
    status: "todo",
    dueDate: null,
    description: "",
    subtasks: [],
    createdAt: Date.now(),
    projectId: projectId ?? null,
  };
  tasks.unshift(task);
  saveTasks();
  render();
  return task;
}

function toggleTaskDone(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.status = task.status === "done" ? "todo" : "done";
  saveTasks();
  render();
}

function setTaskStatus(id, status) {
  const task = tasks.find((t) => t.id === id);
  if (!task || !STATUSES.includes(status)) return;
  task.status = status;
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

// ---- Actions (projets) ----

function addProject(name) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const project = {
    id: makeId(),
    name: trimmed,
    description: "",
    sortMode: "manual",
    taskOrder: [],
    createdAt: Date.now(),
  };
  projects.push(project);
  saveProjects();
  render();
  return project;
}

function deleteProject(id) {
  projects = projects.filter((p) => p.id !== id);
  // Les quêtes du projet supprimé ne sont pas perdues : elles redeviennent
  // simplement des quêtes sans projet.
  for (const task of tasks) {
    if (task.projectId === id) task.projectId = null;
  }
  saveProjects();
  saveTasks();
  render();
}

function getProjectById(id) {
  return id ? projects.find((p) => p.id === id) ?? null : null;
}

function setFilter(filter) {
  currentFilter = filter;
  [...filtersEl.querySelectorAll(".filter-btn")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  render();
}

function switchView(view) {
  if (!viewSections[view]) return;
  currentView = view;
  saveView();
  [...viewNav.querySelectorAll(".view-link")].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  Object.entries(viewSections).forEach(([name, section]) => {
    section.hidden = name !== view;
  });
  // La vue Projets a déjà son propre champ de création de quête par projet.
  quickAddPanel.hidden = view === "project";
  render();
}

// ---- Rendering : dispatch ----

function render() {
  if (currentView === "list") renderListView();
  else if (currentView === "kanban") renderKanbanView();
  else if (currentView === "calendar") renderCalendarView();
  else if (currentView === "project") renderProjectView();
}

// ---- Vue Liste ----

function getFilteredTasks() {
  return currentFilter === "done"
    ? tasks.filter((t) => t.status === "done")
    : tasks.filter((t) => t.status !== "done");
}

function sortTasks(list, sortKey) {
  const sorted = [...list];
  if (sortKey === "due") {
    sorted.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return b.createdAt - a.createdAt;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });
  } else if (sortKey === "priority") {
    sorted.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

// Regroupe une liste de tâches en sections { label, tasks }, selon le mode choisi.
function groupTasks(list, groupBy) {
  if (groupBy === "category") return groupByCategory(list);
  if (groupBy === "due") return groupByDueDate(list);
  if (groupBy === "created") return groupByCreatedDate(list);
  return null;
}

function groupByCategory(list) {
  return ["high", "medium", "low"] // Urgent, Todo, Fond
    .map((priority) => ({
      label: PRIORITY_LABEL[priority],
      tasks: list.filter((t) => t.priority === priority),
    }))
    .filter((group) => group.tasks.length > 0);
}

function groupByDueDate(list) {
  const withDate = list.filter((t) => t.dueDate);
  const withoutDate = list.filter((t) => !t.dueDate);

  const dates = [...new Set(withDate.map((t) => t.dueDate))].sort();
  const groups = dates.map((dateStr) => ({
    label: `${formatDueDate(dateStr)} - ${formatDaysRemaining(daysUntilDue(dateStr))}`,
    tasks: list.filter((t) => t.dueDate === dateStr),
  }));

  if (withoutDate.length > 0) {
    groups.push({ label: "Sans échéance", tasks: withoutDate });
  }

  return groups;
}

function groupByCreatedDate(list) {
  const createdDateStr = (t) => toDateStr(new Date(t.createdAt));
  const dates = [...new Set(list.map(createdDateStr))].sort();
  return dates.map((dateStr) => ({
    label: formatDueDate(dateStr),
    tasks: list.filter((t) => createdDateStr(t) === dateStr),
  }));
}

function renderListView() {
  const filtered = getFilteredTasks();
  list.innerHTML = "";

  const groups = groupTasks(filtered, currentGroupBy);
  if (groups) {
    for (const group of groups) {
      list.appendChild(renderGroupSeparator(group.label));
      for (const task of sortTasks(group.tasks, currentSort)) {
        list.appendChild(renderTaskItem(task));
      }
    }
  } else {
    for (const task of sortTasks(filtered, currentSort)) {
      list.appendChild(renderTaskItem(task));
    }
  }

  const isEmpty = filtered.length === 0;
  emptyState.classList.toggle("visible", isEmpty);
  emptyState.querySelector("p").textContent =
    tasks.length === 0
      ? "Aucune quête ici. Le repos vous attend, ou ajoutez-en une nouvelle."
      : "Aucune quête ne correspond à ce filtre.";
}

function renderGroupSeparator(label) {
  const li = document.createElement("li");
  li.className = "task-group-separator";
  li.textContent = label;
  return li;
}

function renderTaskItem(task, { draggable = false } = {}) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.status === "done" ? " done" : "");
  li.dataset.id = task.id;
  li.title = "Cliquez pour ouvrir la quête";
  li.addEventListener("click", (e) => {
    if (e.target.closest(".task-check")) return;
    openTaskModal(task);
  });

  if (draggable) {
    li.draggable = true;
    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", task.id);
      e.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("dragging"));
  }

  const checkBtn = document.createElement("button");
  checkBtn.className = "task-check";
  checkBtn.type = "button";
  const isDone = task.status === "done";
  checkBtn.setAttribute("aria-label", isDone ? "Marquer comme non terminée" : "Marquer comme terminée");
  checkBtn.textContent = isDone ? "✓" : "";
  checkBtn.addEventListener("click", () => toggleTaskDone(task.id));

  const body = document.createElement("div");
  body.className = "task-body";

  const textEl = document.createElement("div");
  textEl.className = "task-text";
  renderTaskTitle(textEl, task);

  const meta = buildMetaRow(task);

  body.appendChild(textEl);
  body.appendChild(meta);

  li.appendChild(checkBtn);
  li.appendChild(body);

  return li;
}

function renderTaskTitle(textEl, task) {
  textEl.textContent = "";
  textEl.append(task.text);

  if (task.dueDate) {
    textEl.append(" – ");

    const todayStr = toDateStr(new Date());
    const isToday = task.dueDate === todayStr;
    const isOverdue = task.status !== "done" && task.dueDate < todayStr;

    const dateSpan = document.createElement("span");
    dateSpan.className = "task-due-inline" + (isToday ? " today" : "") + (isOverdue ? " overdue" : "");
    dateSpan.textContent = isToday ? "Aujourd'hui" : formatDueDate(task.dueDate);
    textEl.appendChild(dateSpan);
  }
}

// Vue Kanban uniquement : l'échéance est affichée sur sa propre ligne,
// avec le nombre de jours restants entre parenthèses.
function buildKanbanDueLine(task) {
  if (!task.dueDate) return null;

  const diffDays = daysUntilDue(task.dueDate);
  const isToday = diffDays === 0;
  const isOverdue = task.status !== "done" && diffDays < 0;

  const line = document.createElement("div");
  line.className = "kanban-due-line" + (isToday ? " today" : "") + (isOverdue ? " overdue" : "");
  line.textContent = isToday
    ? "Aujourd'hui"
    : `${formatDueDate(task.dueDate)} (${formatDaysRemaining(diffDays)})`;
  return line;
}

function buildMetaRow(task) {
  const meta = document.createElement("div");
  meta.className = "task-meta";

  const badge = document.createElement("span");
  badge.className = `badge priority-${task.priority}`;
  badge.textContent = PRIORITY_LABEL[task.priority] ?? task.priority;
  meta.appendChild(badge);

  const project = getProjectById(task.projectId);
  if (project) {
    const projectBadge = document.createElement("span");
    projectBadge.className = "badge project-tag";
    projectBadge.textContent = project.name;
    meta.appendChild(projectBadge);
  }

  if (!task.description || !task.description.trim()) {
    const noDescBadge = document.createElement("span");
    noDescBadge.className = "badge no-desc";
    noDescBadge.textContent = "⚠️ Sans description";
    meta.appendChild(noDescBadge);
  }

  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.done).length;
    const subBadge = document.createElement("span");
    subBadge.className = "badge subtask-progress" + (done === task.subtasks.length ? " all-done" : "");
    subBadge.textContent = `☑ ${done}/${task.subtasks.length}`;
    meta.appendChild(subBadge);
  }

  return meta;
}

// ---- Modale d'édition de tâche ----

function populateModalProjectOptions(selectedId) {
  modalProjectInput.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "Aucun";
  modalProjectInput.appendChild(noneOption);

  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    modalProjectInput.appendChild(option);
  }

  modalProjectInput.value = selectedId ?? "";
}

function openTaskModal(task) {
  editingTaskId = task.id;
  modalTitleInput.value = task.text;
  modalPriorityInput.value = task.priority;
  modalDueInput.value = task.dueDate ?? "";
  modalDescInput.value = task.description ?? "";
  populateModalProjectOptions(task.projectId);
  modalSubtaskInput.value = "";
  renderModalSubtasks();
  modalBackdrop.hidden = false;
  modalTitleInput.focus();
  modalTitleInput.select();
}

function closeTaskModal() {
  modalBackdrop.hidden = true;
  editingTaskId = null;
}

function getEditingTask() {
  return editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null;
}

function saveTaskModal() {
  const task = getEditingTask();
  if (!task) return;

  const trimmedTitle = modalTitleInput.value.trim();
  if (!trimmedTitle) {
    modalTitleInput.focus();
    return;
  }

  task.text = trimmedTitle;
  task.priority = modalPriorityInput.value;
  task.dueDate = modalDueInput.value || null;
  task.description = modalDescInput.value.trim();
  task.projectId = modalProjectInput.value || null;

  saveTasks();
  render();
  closeTaskModal();
}

function deleteTaskModal() {
  if (!editingTaskId) return;
  deleteTask(editingTaskId);
  closeTaskModal();
}

// ---- Confirmation (générique) ----
// Réutilisée pour la suppression de tâche (accessible uniquement depuis la
// modale) et pour le remplacement des quêtes lors d'un import JSON.

function openConfirm({ text, confirmLabel = "Confirmer", onConfirm }) {
  confirmText.textContent = text;
  confirmDeleteBtn.textContent = confirmLabel;
  pendingConfirmAction = onConfirm;
  confirmBackdrop.hidden = false;
  confirmCancelBtn.focus();
}

function closeConfirmDelete() {
  confirmBackdrop.hidden = true;
  pendingConfirmAction = null;
}

// ---- Sous-tâches ----
// Contrairement au titre/échéance/description (validés via "Enregistrer"),
// les sous-tâches sont appliquées et sauvegardées immédiatement, comme dans Trello.

function renderModalSubtasks() {
  const task = getEditingTask();
  if (!task) return;

  const subtasks = task.subtasks;
  const doneCount = subtasks.filter((s) => s.done).length;

  modalSubtasksProgress.textContent = subtasks.length > 0 ? `${doneCount}/${subtasks.length}` : "";
  modalSubtasksBar.hidden = subtasks.length === 0;
  modalSubtasksFill.style.width = subtasks.length > 0 ? `${(doneCount / subtasks.length) * 100}%` : "0%";

  modalSubtaskList.innerHTML = "";
  for (const subtask of subtasks) {
    modalSubtaskList.appendChild(renderSubtaskItem(task.id, subtask));
  }
}

function renderSubtaskItem(taskId, subtask) {
  const li = document.createElement("li");
  li.className = "subtask-item" + (subtask.done ? " done" : "");

  const checkBtn = document.createElement("button");
  checkBtn.type = "button";
  checkBtn.className = "subtask-check";
  checkBtn.setAttribute("aria-label", subtask.done ? "Marquer comme non terminée" : "Marquer comme terminée");
  checkBtn.textContent = subtask.done ? "✓" : "";
  checkBtn.addEventListener("click", () => toggleSubtask(taskId, subtask.id));

  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "subtask-text";
  textInput.maxLength = 80;
  textInput.value = subtask.text;
  textInput.addEventListener("change", () => editSubtaskText(taskId, subtask.id, textInput.value));
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      textInput.blur();
    }
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "subtask-delete";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", "Supprimer la sous-tâche");
  deleteBtn.addEventListener("click", () => deleteSubtask(taskId, subtask.id));

  li.appendChild(checkBtn);
  li.appendChild(textInput);
  li.appendChild(deleteBtn);

  return li;
}

function addSubtask(taskId, text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.subtasks.push({ id: makeId(), text: trimmed, done: false });
  saveTasks();
  render();
  renderModalSubtasks();
}

function toggleSubtask(taskId, subtaskId) {
  const task = tasks.find((t) => t.id === taskId);
  const subtask = task?.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;
  subtask.done = !subtask.done;
  saveTasks();
  render();
  renderModalSubtasks();
}

function editSubtaskText(taskId, subtaskId, newText) {
  const task = tasks.find((t) => t.id === taskId);
  const subtask = task?.subtasks.find((s) => s.id === subtaskId);
  if (!subtask) return;
  const trimmed = newText.trim();
  if (!trimmed) {
    deleteSubtask(taskId, subtaskId);
    return;
  }
  subtask.text = trimmed;
  saveTasks();
  render();
  renderModalSubtasks();
}

function deleteSubtask(taskId, subtaskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  task.subtasks = task.subtasks.filter((s) => s.id !== subtaskId);
  saveTasks();
  render();
  renderModalSubtasks();
}

// ---- Vue Kanban ----

function renderKanbanView() {
  for (const status of STATUSES) {
    const column = kanbanLists[status];
    column.innerHTML = "";

    const columnTasks = tasks
      .filter((t) => t.status === status)
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.createdAt - a.createdAt);

    kanbanCounts[status].textContent = String(columnTasks.length);

    if (columnTasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "kanban-empty";
      empty.textContent = "Aucune quête";
      column.appendChild(empty);
      continue;
    }

    const expanded = kanbanExpanded[status];
    const visibleTasks = expanded ? columnTasks : columnTasks.slice(0, KANBAN_PAGE_SIZE);

    for (const task of visibleTasks) {
      column.appendChild(renderKanbanCard(task));
    }

    if (columnTasks.length > KANBAN_PAGE_SIZE) {
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "kanban-toggle-btn";
      toggleBtn.textContent = expanded ? "Afficher moins" : `Afficher tout (${columnTasks.length})`;
      toggleBtn.addEventListener("click", () => {
        kanbanExpanded[status] = !kanbanExpanded[status];
        renderKanbanView();
      });
      column.appendChild(toggleBtn);
    }
  }
}

function renderKanbanCard(task) {
  const card = document.createElement("div");
  card.className = "kanban-card";
  card.dataset.id = task.id;
  card.draggable = true;
  card.title = "Cliquez pour ouvrir la quête";

  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
  card.addEventListener("click", () => openTaskModal(task));

  const textEl = document.createElement("div");
  textEl.className = "task-text";
  textEl.textContent = task.text;

  const dueLine = buildKanbanDueLine(task);

  const meta = buildMetaRow(task);
  meta.classList.add("kanban-card-meta");

  card.appendChild(textEl);
  if (dueLine) card.appendChild(dueLine);
  card.appendChild(meta);

  return card;
}

function setupKanbanDragTargets() {
  document.querySelectorAll(".kanban-column").forEach((column) => {
    column.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", (e) => {
      e.preventDefault();
      column.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text/plain");
      setTaskStatus(id, column.dataset.status);
    });
  });
}

// ---- Vue Calendrier ----

function renderCalendarView() {
  renderCalendarGrid();
  renderAgenda();
}

function renderCalendarGrid() {
  const { year, month } = calendarCursor;
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  calMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7; // lundi = 0
  const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;

  const todayStr = toDateStr(new Date());

  // Regroupe les tâches par date d'échéance
  const tasksByDate = {};
  for (const task of tasks) {
    if (!task.dueDate) continue;
    (tasksByDate[task.dueDate] ??= []).push(task);
  }

  calGrid.innerHTML = "";

  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - leadingBlanks + 1;
    const cellDate = new Date(year, month, dayNum);
    const cellStr = toDateStr(cellDate);
    const inCurrentMonth = cellDate.getMonth() === month;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";
    if (!inCurrentMonth) cell.classList.add("other-month");
    if (cellStr === todayStr) cell.classList.add("today");
    if (cellStr === selectedDate) cell.classList.add("selected");
    cell.dataset.date = cellStr;

    const num = document.createElement("span");
    num.className = "calendar-day-num";
    num.textContent = String(cellDate.getDate());
    cell.appendChild(num);

    const dayTasks = tasksByDate[cellStr] ?? [];
    if (dayTasks.length > 0) {
      const dots = document.createElement("div");
      dots.className = "calendar-dots";
      const shown = dayTasks.slice(0, 4);
      for (const t of shown) {
        const dot = document.createElement("span");
        dot.className = `calendar-dot priority-${t.priority}`;
        dots.appendChild(dot);
      }
      cell.appendChild(dots);
      if (dayTasks.length > shown.length) {
        const more = document.createElement("span");
        more.className = "calendar-day-more";
        more.textContent = `+${dayTasks.length - shown.length}`;
        cell.appendChild(more);
      }
    }

    cell.addEventListener("click", () => {
      selectedDate = cellStr;
      if (!inCurrentMonth) {
        calendarCursor = { year: cellDate.getFullYear(), month: cellDate.getMonth() };
      }
      renderCalendarView();
    });

    calGrid.appendChild(cell);
  }
}

function renderAgenda() {
  const dayTasks = tasks
    .filter((t) => t.dueDate === selectedDate)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const dateObj = parseDateStr(selectedDate);
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(dateObj);
  agendaTitle.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  agendaList.innerHTML = "";
  for (const task of dayTasks) {
    agendaList.appendChild(renderTaskItem(task));
  }

  agendaEmpty.classList.toggle("visible", dayTasks.length === 0);
}

// ---- Vue Projets ----

function renderProjectView() {
  projectListEl.innerHTML = "";

  for (const project of projects) {
    projectListEl.appendChild(renderProjectPanel(project));
  }

  projectEmptyState.classList.toggle("visible", projects.length === 0);
}

function renderProjectPanel(project) {
  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const orderedTasks = getOrderedProjectTasks(project, projectTasks);

  const section = document.createElement("section");
  section.className = "panel project-panel";
  section.dataset.id = project.id;
  section.title = "Cliquez pour modifier le projet";
  section.addEventListener("click", (e) => {
    if (e.target.closest(".project-delete-btn, .project-quest-form, .project-toolbar, .project-task-list")) return;
    openProjectModal(project);
  });

  const header = document.createElement("div");
  header.className = "project-header";

  const name = document.createElement("h3");
  name.className = "project-name";
  name.textContent = project.name;

  const count = document.createElement("span");
  count.className = "project-count";
  count.textContent = `${projectTasks.length} quête${projectTasks.length > 1 ? "s" : ""}`;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "project-delete-btn";
  deleteBtn.textContent = "✕";
  deleteBtn.setAttribute("aria-label", "Supprimer le projet");
  deleteBtn.addEventListener("click", () => {
    openConfirm({
      text: `Supprimer le projet « ${project.name} » ? Les quêtes qu'il contient seront conservées, mais n'appartiendront plus à aucun projet.`,
      confirmLabel: "Supprimer le projet",
      onConfirm: () => deleteProject(project.id),
    });
  });

  header.appendChild(name);
  header.appendChild(count);
  header.appendChild(deleteBtn);

  const form = document.createElement("form");
  form.className = "project-quest-form";
  form.autocomplete = "off";

  const questInput = document.createElement("input");
  questInput.type = "text";
  questInput.placeholder = "Ajouter une quête à ce projet…";
  questInput.maxLength = 140;
  questInput.required = true;

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "btn-primary";
  submitBtn.innerHTML = "<span>+ Ajouter</span>";

  form.appendChild(questInput);
  form.appendChild(submitBtn);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const task = addTask(questInput.value, project.id);
    questInput.value = "";
    if (task) openTaskModal(task);
  });

  section.appendChild(header);
  section.appendChild(form);

  if (orderedTasks.length === 0) {
    const hint = document.createElement("p");
    hint.className = "project-empty-hint";
    hint.textContent = "Aucune quête dans ce projet.";
    section.appendChild(hint);
    return section;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "project-toolbar";

  const sortLabel = document.createElement("label");
  sortLabel.textContent = "Trier par";
  sortLabel.htmlFor = `project-sort-${project.id}`;

  const sortSelect = document.createElement("select");
  sortSelect.id = `project-sort-${project.id}`;
  sortSelect.innerHTML = `
    <option value="manual">Manuel</option>
    <option value="due">Échéance</option>
    <option value="priority">Priorité</option>
  `;
  sortSelect.value = project.sortMode;
  sortSelect.addEventListener("change", () => {
    project.sortMode = sortSelect.value;
    saveProjects();
    renderProjectView();
  });

  toolbar.appendChild(sortLabel);
  toolbar.appendChild(sortSelect);
  section.appendChild(toolbar);

  const manual = project.sortMode === "manual";
  const taskListEl = document.createElement("ul");
  taskListEl.className = "task-list project-task-list";
  for (const task of orderedTasks) {
    taskListEl.appendChild(renderTaskItem(task, { draggable: manual }));
  }
  if (manual) setupProjectTaskDragTargets(taskListEl, project);

  section.appendChild(taskListEl);

  return section;
}

// Ordonne les quêtes d'un projet selon son mode de tri.
function getOrderedProjectTasks(project, projectTasks) {
  if (project.sortMode === "due") return sortTasks(projectTasks, "due");
  if (project.sortMode === "priority") return sortTasks(projectTasks, "priority");
  return getManualOrderedTasks(project, projectTasks);
}

// Applique l'ordre manuel persistant (`project.taskOrder`) et se répare tout
// seul : les quêtes retirées du projet disparaissent de l'ordre, celles qui
// n'y figurent pas encore (nouvelles) sont ajoutées à la suite.
function getManualOrderedTasks(project, projectTasks) {
  const byId = new Map(projectTasks.map((t) => [t.id, t]));
  const ordered = [];
  for (const id of project.taskOrder) {
    const task = byId.get(id);
    if (task) {
      ordered.push(task);
      byId.delete(id);
    }
  }
  const rest = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
  const merged = [...ordered, ...rest];

  const mergedIds = merged.map((t) => t.id);
  if (mergedIds.join(",") !== project.taskOrder.join(",")) {
    project.taskOrder = mergedIds;
    saveProjects();
  }

  return merged;
}

// Réordonnancement manuel par glisser-déposer, à l'intérieur d'une même liste
// (contrairement au Kanban qui déplace entre colonnes).
function getDragAfterElement(container, y) {
  const items = [...container.querySelectorAll(".task-item:not(.dragging)")];
  return items.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function setupProjectTaskDragTargets(container, project) {
  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = container.querySelector(".task-item.dragging");
    if (!dragging) return;
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement == null) {
      container.appendChild(dragging);
    } else {
      container.insertBefore(dragging, afterElement);
    }
  });

  container.addEventListener("drop", (e) => {
    e.preventDefault();
    project.taskOrder = [...container.querySelectorAll(".task-item")].map((li) => li.dataset.id);
    saveProjects();
    render();
  });
}

// ---- Modale d'édition de projet ----

function openProjectModal(project) {
  editingProjectId = project.id;
  projectModalTitleInput.value = project.name;
  projectModalDescInput.value = project.description ?? "";
  projectModalBackdrop.hidden = false;
  projectModalTitleInput.focus();
  projectModalTitleInput.select();
}

function closeProjectModal() {
  projectModalBackdrop.hidden = true;
  editingProjectId = null;
}

function getEditingProject() {
  return editingProjectId ? projects.find((p) => p.id === editingProjectId) ?? null : null;
}

function saveProjectModal() {
  const project = getEditingProject();
  if (!project) return;

  const trimmedName = projectModalTitleInput.value.trim();
  if (!trimmedName) {
    projectModalTitleInput.focus();
    return;
  }

  project.name = trimmedName;
  project.description = projectModalDescInput.value.trim();

  saveProjects();
  render();
  closeProjectModal();
}

function deleteProjectModal() {
  if (!editingProjectId) return;
  deleteProject(editingProjectId);
  closeProjectModal();
}

// ---- Événements ----

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const task = addTask(input.value);
  input.value = "";
  if (task) openTaskModal(task);
});

filtersEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".filter-btn");
  if (!btn) return;
  setFilter(btn.dataset.filter);
});

groupSelectEl.addEventListener("change", () => {
  currentGroupBy = groupSelectEl.value;
  render();
});

sortSelectEl.addEventListener("change", () => {
  currentSort = sortSelectEl.value;
  render();
});

viewNav.addEventListener("click", (e) => {
  const btn = e.target.closest(".view-link");
  if (!btn) return;
  switchView(btn.dataset.view);
});

projectForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const project = addProject(projectInput.value);
  projectInput.value = "";
  if (project) openProjectModal(project);
});

themeToggleBtn.addEventListener("click", toggleTheme);

settingsToggleBtn.addEventListener("click", openSettingsModal);
settingsCloseBtn.addEventListener("click", closeSettingsModal);
settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsBackdrop) closeSettingsModal();
});

exportJsonBtn.addEventListener("click", exportTasksAsJson);
importJsonBtn.addEventListener("click", () => importJsonInput.click());
importJsonInput.addEventListener("change", () => {
  const file = importJsonInput.files[0];
  importJsonInput.value = ""; // permet de resélectionner le même fichier
  if (file) importTasksFromFile(file);
});

modalSaveBtn.addEventListener("click", saveTaskModal);
modalDeleteBtn.addEventListener("click", () => {
  openConfirm({
    text: "Supprimer définitivement cette quête ? Cette action est irréversible.",
    confirmLabel: "Supprimer définitivement",
    onConfirm: deleteTaskModal,
  });
});
modalCancelBtn.addEventListener("click", closeTaskModal);
modalCloseBtn.addEventListener("click", closeTaskModal);

projectModalSaveBtn.addEventListener("click", saveProjectModal);
projectModalDeleteBtn.addEventListener("click", () => {
  const project = getEditingProject();
  if (!project) return;
  openConfirm({
    text: `Supprimer le projet « ${project.name} » ? Les quêtes qu'il contient seront conservées, mais n'appartiendront plus à aucun projet.`,
    confirmLabel: "Supprimer le projet",
    onConfirm: deleteProjectModal,
  });
});
projectModalCancelBtn.addEventListener("click", closeProjectModal);
projectModalCloseBtn.addEventListener("click", closeProjectModal);

projectModalBackdrop.addEventListener("click", (e) => {
  if (e.target === projectModalBackdrop) closeProjectModal();
});

projectModalTitleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveProjectModal();
  }
});

confirmCancelBtn.addEventListener("click", closeConfirmDelete);
confirmDeleteBtn.addEventListener("click", () => {
  const action = pendingConfirmAction;
  closeConfirmDelete();
  if (action) action();
});

confirmBackdrop.addEventListener("click", (e) => {
  if (e.target === confirmBackdrop) closeConfirmDelete();
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeTaskModal();
});

modalTitleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveTaskModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!confirmBackdrop.hidden) {
    closeConfirmDelete();
  } else if (!settingsBackdrop.hidden) {
    closeSettingsModal();
  } else if (!modalBackdrop.hidden) {
    closeTaskModal();
  } else if (!projectModalBackdrop.hidden) {
    closeProjectModal();
  }
});

modalSubtaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!editingTaskId) return;
  addSubtask(editingTaskId, modalSubtaskInput.value);
  modalSubtaskInput.value = "";
  modalSubtaskInput.focus();
});

calPrevBtn.addEventListener("click", () => {
  calendarCursor.month -= 1;
  if (calendarCursor.month < 0) {
    calendarCursor.month = 11;
    calendarCursor.year -= 1;
  }
  renderCalendarView();
});

calNextBtn.addEventListener("click", () => {
  calendarCursor.month += 1;
  if (calendarCursor.month > 11) {
    calendarCursor.month = 0;
    calendarCursor.year += 1;
  }
  renderCalendarView();
});

calTodayBtn.addEventListener("click", () => {
  const now = new Date();
  calendarCursor = { year: now.getFullYear(), month: now.getMonth() };
  selectedDate = toDateStr(now);
  renderCalendarView();
});

// ---- Init ----

setupKanbanDragTargets();
applyTheme(getTheme()); // synchronise l'icône avec le thème déjà appliqué (script d'amorçage dans <head>)
switchView(currentView); // synchronise l'UI et déclenche le premier rendu
