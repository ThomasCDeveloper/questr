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
const POMODORO_STORAGE_KEY = "grimoire-taches.pomodoro";

// Fenêtre détachée (pop-out) de l'écran Pomodoro : `index.html?pomodoro=popout`,
// ouverte via window.open. Elle exécute exactement le même script, mais
// n'affiche que l'écran Pomodoro (voir le bloc Init en bas de fichier).
const isPomodoroPopout = new URLSearchParams(location.search).get("pomodoro") === "popout";

const VIEWS = ["list", "kanban", "calendar", "project", "matrix"];
const MATRIX_QUADRANTS = ["do", "schedule", "delegate", "eliminate"];
const MATRIX_URGENT_WITHIN_DAYS = 3;

const STATUSES = ["todo", "doing", "done"];
const STATUS_LABEL = { todo: "À commencer", doing: "En cours", done: "Terminé" };
const PRIORITY_LABEL = { low: "Fond", medium: "Todo", high: "Urgent" };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const DIFFICULTY_LABEL = { easy: "Facile", medium: "Modérée", hard: "Difficile" };
const MAX_TAGS_PER_TASK = 6;
const MAX_TAG_LENGTH = 24;

/** @typedef {{id: string, text: string, done: boolean}} Subtask */
/** @typedef {{id: string, text: string, priority: "low"|"medium"|"high", status: "todo"|"doing"|"done", dueDate: string|null, description: string, subtasks: Subtask[], createdAt: number, projectId: string|null, difficulty: "easy"|"medium"|"hard"|null, tags: string[]}} Task */
/** @typedef {{id: string, name: string, description: string, sortMode: "manual"|"due"|"priority", taskOrder: string[], createdAt: number}} Project */

/** @type {Task[]} */
let tasks = loadTasks();
/** @type {Project[]} */
let projects = loadProjects();
let currentFilter = "active"; // vue Liste : "active" | "done"
let currentGroupBy = "none"; // vue Liste : "none" | "category" | "due" | "created" | "tag"
let currentSearchQuery = ""; // vue Liste : filtre texte (titre, description, projet), déjà en minuscules
let currentView = loadView(); // "list" | "kanban" | "calendar" | "project"

const KANBAN_PAGE_SIZE = 5;
let kanbanExpanded = { todo: false, doing: false, done: false };

const today = new Date();
let calendarCursor = { year: today.getFullYear(), month: today.getMonth() };
let selectedDate = toDateStr(today);

// ---- DOM refs ----
const topActionsRow = document.getElementById("top-actions-row");
const form = document.getElementById("task-form");
const input = document.getElementById("task-input");
const themeToggleBtn = document.getElementById("theme-toggle");

const navToggleBtn = document.getElementById("nav-toggle");
const navBackdrop = document.getElementById("nav-backdrop");
const viewNav = document.getElementById("view-nav");
const viewSections = {
  list: document.getElementById("view-list"),
  kanban: document.getElementById("view-kanban"),
  calendar: document.getElementById("view-calendar"),
  project: document.getElementById("view-project"),
  matrix: document.getElementById("view-matrix"),
};

// Vue Liste
const list = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const filtersEl = document.getElementById("filters");
const groupSelectEl = document.getElementById("group-select");
const searchInputEl = document.getElementById("search-input");

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

// Vue Matrice d'Eisenhower
const matrixLists = {
  do: document.getElementById("matrix-do"),
  schedule: document.getElementById("matrix-schedule"),
  delegate: document.getElementById("matrix-delegate"),
  eliminate: document.getElementById("matrix-eliminate"),
};
const matrixCounts = {
  do: document.getElementById("count-do"),
  schedule: document.getElementById("count-schedule"),
  delegate: document.getElementById("count-delegate"),
  eliminate: document.getElementById("count-eliminate"),
};
const matrixLegend = document.getElementById("matrix-legend");

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
const modalDifficultyInput = document.getElementById("modal-difficulty-input");
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
const modalTagList = document.getElementById("modal-tag-list");
const modalTagForm = document.getElementById("modal-tag-form");
const modalTagInput = document.getElementById("modal-tag-input");
const modalTagDatalist = document.getElementById("modal-tag-datalist");

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

// Toast (retour d'erreur, ex : échec d'enregistrement)
const toastEl = document.getElementById("toast");
let toastTimer = null;

// Écran Pomodoro — minuteur de concentration global (indépendant des
// quêtes), lancé depuis le bouton à droite de la barre d'ajout rapide (deux
// exemplaires du même bouton : un global, un dans la vue Projets, qui a son
// propre champ de création et masque le premier).
const POMODORO_DURATION_SECONDS = 25 * 60;
const pomodoroLaunchBtn = document.getElementById("pomodoro-launch-btn");
const pomodoroLaunchBtnProject = document.getElementById("pomodoro-launch-btn-project");
const pomodoroLaunchBtnNav = document.getElementById("pomodoro-launch-btn-nav");
const pomodoroBackdrop = document.getElementById("pomodoro-backdrop");
const pomodoroProgressFill = document.getElementById("pomodoro-progress-fill");
const pomodoroTimeEl = document.getElementById("pomodoro-time");
const pomodoroStatusEl = document.getElementById("pomodoro-status");
const pomodoroPauseBtn = document.getElementById("pomodoro-pause-btn");
const pomodoroCloseBtn = document.getElementById("pomodoro-close-btn");
const pomodoroPopoutBtn = document.getElementById("pomodoro-popout-btn");
pomodoroPopoutBtn.hidden = isPomodoroPopout; // pas de pop-out depuis un pop-out
// Fenêtre Picture-in-Picture actuellement ouverte (voir openPomodoroPip), le
// cas échéant — `null` sinon.
let pomodoroPipWindow = null;
// Une seule session à la fois, mais persistée dans localStorage (voir
// persistPomodoroSession) pour rester visible et pilotable depuis la fenêtre
// détachée : { endAt, remainingSeconds, intervalId }. `endAt` (une échéance
// absolue) vaut `null` tant que la session est en pause (ou terminée) ;
// `intervalId` n'existe que dans cette fenêtre, jamais persisté.
let pomodoroSession = null;

let editingTaskId = null;
let editingProjectId = null;
// Brouillon des tags de la tâche en cours d'édition (voir "Tags" plus bas) :
// contrairement aux sous-tâches, appliqué à la tâche seulement à l'enregistrement,
// comme le titre, l'échéance, etc.
let modalTagsDraft = [];

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
    difficulty: ["easy", "medium", "hard"].includes(raw.difficulty) ? raw.difficulty : null,
    tags: sanitizeTags(raw.tags),
  };
}

// Nettoie une liste de tags bruts : espaces superflus, entrées vides, doublons
// (comparaison insensible à la casse, mais la casse saisie est conservée),
// longueur et nombre plafonnés.
function sanitizeTags(rawTags) {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of rawTags) {
    const trimmed = String(raw ?? "").trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_TAGS_PER_TASK) break;
  }
  return result;
}

// Tags distincts utilisés sur l'ensemble des tâches, triés — sert à
// l'autocomplétion dans la modale et au regroupement par tag.
function getAllTags() {
  const set = new Set();
  for (const task of tasks) {
    for (const tag of task.tags) set.add(tag);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
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
    showToast("Échec de l'enregistrement des quêtes. Vos derniers changements risquent d'être perdus.");
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
    showToast("Échec de l'enregistrement des projets. Vos derniers changements risquent d'être perdus.");
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

// ---- Toast ----

function showToast(message, duration = 5000) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, duration);
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
  const dataStr = JSON.stringify({ tasks, projects }, null, 2);
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

    // Ancien format : une simple liste de quêtes, sans projets.
    // Nouveau format : { tasks: [...], projects: [...] }.
    let importedTasks;
    let importedProjects = null;
    if (Array.isArray(parsed)) {
      importedTasks = parsed;
    } else if (parsed && Array.isArray(parsed.tasks)) {
      importedTasks = parsed.tasks;
      importedProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
    } else {
      showImportError("Ce fichier ne contient pas de quêtes reconnues.");
      return;
    }

    const taskCount = importedTasks.length;
    const parts = [`${taskCount} quête${taskCount > 1 ? "s" : ""}`];
    if (importedProjects) {
      parts.push(`${importedProjects.length} projet${importedProjects.length > 1 ? "s" : ""}`);
    }

    openConfirm({
      text:
        `Importer ${parts.join(" et ")} ? Cela remplacera définitivement toutes les quêtes actuelles` +
        `${importedProjects ? " et tous les projets actuels" : ""}.`,
      confirmLabel: "Remplacer",
      onConfirm: () => {
        tasks = importedTasks.map(normalizeTask);
        saveTasks();
        if (importedProjects) {
          projects = importedProjects.map(normalizeProject);
          saveProjects();
        }
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

// Le titre peut être vide (ajout rapide sans texte, voir closeTaskModal) :
// la quête s'ouvre alors directement dans sa modale, prête à être nommée.
function addTask(text, projectId = null) {
  const trimmed = text.trim();
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
    difficulty: null,
    tags: [],
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

// Le nom peut être vide (ajout rapide sans texte, voir closeProjectModal) :
// le projet s'ouvre alors directement dans sa modale, prêt à être nommé.
function addProject(name) {
  const trimmed = name.trim();
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

// ---- Menu des vues (tiroir latéral sous 640px) ----

function isMobileLayout() {
  return window.matchMedia("(max-width: 639px)").matches;
}

function openNavDrawer() {
  viewNav.classList.add("open");
  navBackdrop.hidden = false;
  navToggleBtn.setAttribute("aria-expanded", "true");
}

function closeNavDrawer() {
  viewNav.classList.remove("open");
  navBackdrop.hidden = true;
  navToggleBtn.setAttribute("aria-expanded", "false");
}

function toggleNavDrawer() {
  if (viewNav.classList.contains("open")) closeNavDrawer();
  else openNavDrawer();
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
  // La vue Projets a déjà son propre champ de création de quête par projet,
  // et son propre bouton Pomodoro.
  topActionsRow.hidden = view === "project";
  render();
}

// ---- Rendering : dispatch ----

function render() {
  if (currentView === "list") renderListView();
  else if (currentView === "kanban") renderKanbanView();
  else if (currentView === "calendar") renderCalendarView();
  else if (currentView === "project") renderProjectView();
  else if (currentView === "matrix") renderMatrixView();
}

// ---- Vue Liste ----

function getFilteredTasks() {
  const byStatus =
    currentFilter === "done"
      ? tasks.filter((t) => t.status === "done")
      : tasks.filter((t) => t.status !== "done");

  if (!currentSearchQuery) return byStatus;
  return byStatus.filter((t) => taskMatchesSearch(t, currentSearchQuery));
}

// Filtre en OU : titre, description, nom du projet rattaché, ou tags.
function taskMatchesSearch(task, query) {
  if (task.text.toLowerCase().includes(query)) return true;
  if (task.description && task.description.toLowerCase().includes(query)) return true;
  const project = getProjectById(task.projectId);
  if (project && project.name.toLowerCase().includes(query)) return true;
  if (task.tags.some((tag) => tag.toLowerCase().includes(query))) return true;
  return false;
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
  if (groupBy === "tag") return groupByTag(list);
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

// Contrairement aux autres regroupements, une tâche multi-tags apparaît dans
// plusieurs groupes (elle n'est pas "rangée" une seule fois).
function groupByTag(list) {
  const tagged = list.filter((t) => t.tags.length > 0);
  const untagged = list.filter((t) => t.tags.length === 0);
  const allTags = [...new Set(tagged.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, "fr"));

  const groups = allTags.map((tag) => ({
    label: `#${tag}`,
    tasks: list.filter((t) => t.tags.includes(tag)),
  }));

  if (untagged.length > 0) {
    groups.push({ label: "Sans tag", tasks: untagged });
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
      for (const task of sortTasks(group.tasks, "recent")) {
        list.appendChild(renderTaskItem(task));
      }
    }
  } else {
    for (const task of sortTasks(filtered, "recent")) {
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

  if (task.difficulty) {
    const difficultyBadge = document.createElement("span");
    difficultyBadge.className = `badge difficulty-${task.difficulty}`;
    difficultyBadge.textContent = `${DIFFICULTY_LABEL[task.difficulty] ?? task.difficulty}`;
    meta.appendChild(difficultyBadge);
  }

  if (task.subtasks && task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.done).length;
    const subBadge = document.createElement("span");
    subBadge.className = "badge subtask-progress" + (done === task.subtasks.length ? " all-done" : "");
    subBadge.textContent = `☑ ${done}/${task.subtasks.length}`;
    meta.appendChild(subBadge);
  }

  if (task.tags.length > 0) {
    const VISIBLE_TAGS = 3; // au-delà, un badge "+N" évite de saturer la ligne
    for (const tag of task.tags.slice(0, VISIBLE_TAGS)) {
      const tagBadge = document.createElement("span");
      tagBadge.className = "badge tag";
      tagBadge.textContent = tag;
      meta.appendChild(tagBadge);
    }
    const hiddenCount = task.tags.length - VISIBLE_TAGS;
    if (hiddenCount > 0) {
      const overflowBadge = document.createElement("span");
      overflowBadge.className = "badge tag-overflow";
      overflowBadge.textContent = `+${hiddenCount}`;
      meta.appendChild(overflowBadge);
    }
  }

  return meta;
}

// ---- Pomodoro ----
// Minuteur de concentration global, indépendant des quêtes. Sur mobile, l'écran
// s'affiche en panneau bas avec le reste de l'appli flouté ; sur desktop, il
// s'ouvre dans une fenêtre détachée (PiP ou pop-out), synchronisée via
// localStorage. Une pause fige le décompte ; "Revenir à la liste" abandonne la
// session. À la fin, une notification navigateur est envoyée.

function formatPomodoroTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function ensureNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function sendPomodoroNotification() {
  if (!("Notification" in window)) return; // API absente (navigateur trop ancien, etc.)
  if (Notification.permission !== "granted") {
    // Échec silencieux sinon : l'utilisateur n'a aucun moyen de savoir que
    // la notification n'a pas pu s'afficher (permission refusée/jamais
    // demandée, ou navigateur qui la bloque sur ce contexte — ex. Chrome sur
    // un fichier ouvert en local, plutôt qu'en http(s)).
    showToast("Notification de fin de Pomodoro impossible : autorisez les notifications pour ce site dans votre navigateur.");
    return;
  }
  try {
    new Notification("Pomodoro terminé !", { body: "25 minutes écoulées." });
  } catch (err) {
    console.warn("Impossible d'afficher la notification :", err);
    showToast("Impossible d'afficher la notification (voir la console).");
  }
}

// Persistance de la session dans localStorage : c'est ce qui permet à la
// fenêtre détachée (pop-out) de lire et suivre le décompte en direct. Le
// décompte se base sur une échéance absolue (`endAt`) plutôt qu'un compteur
// décrémenté : chaque fenêtre peut ainsi recalculer le temps restant de son
// côté sans dérive, sans avoir besoin d'être synchronisée à la seconde près.
function persistPomodoroSession() {
  try {
    if (!pomodoroSession) {
      localStorage.removeItem(POMODORO_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      POMODORO_STORAGE_KEY,
      JSON.stringify({
        endAt: pomodoroSession.endAt,
        remainingSeconds: pomodoroSession.remainingSeconds,
      })
    );
  } catch (err) {
    console.warn("Impossible d'enregistrer la session Pomodoro :", err);
  }
}

function readPersistedPomodoroSession() {
  try {
    const raw = localStorage.getItem(POMODORO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function computeRemainingSeconds() {
  if (!pomodoroSession) return 0;
  if (pomodoroSession.endAt == null) return pomodoroSession.remainingSeconds;
  return Math.max(0, Math.round((pomodoroSession.endAt - Date.now()) / 1000));
}

function startPomodoro() {
  ensureNotificationPermission(); // doit être appelé depuis un geste utilisateur
  pomodoroSession = {
    endAt: Date.now() + POMODORO_DURATION_SECONDS * 1000,
    remainingSeconds: POMODORO_DURATION_SECONDS,
    intervalId: null,
  };
  persistPomodoroSession();
  openPomodoroOverlay();
  runPomodoroInterval();
}

// Rouvre l'écran pour la session en cours, SANS changer son état : une
// session en pause reste en pause (affichée avec le bouton "Reprendre") —
// la reprendre ne se fait plus que depuis ce bouton, jamais depuis la page
// principale.
function reopenPomodoro() {
  if (!pomodoroSession) return;
  openPomodoroOverlay();
  if (pomodoroSession.endAt != null) {
    runPomodoroInterval();
  } else if (pomodoroSession.remainingSeconds <= 0) {
    showPomodoroCompletedState();
  }
}

// Bouton unique (barre d'ajout, vue Projets, ou menu mobile) : démarre une
// session ou rouvre celle en cours. Sur mobile, l'écran reste dans la page
// (panneau bas + fond flouté) ; sur desktop, il s'ouvre dans une fenêtre
// détachée (PiP ou pop-out classique).
function launchPomodoro() {
  if (pomodoroSession) reopenPomodoro();
  else startPomodoro();
  if (isMobileLayout()) return;
  pomodoroBackdrop.hidden = true;
  openPomodoroPopout();
}

function runPomodoroInterval() {
  updatePomodoroDisplay();
  pomodoroSession.intervalId = setInterval(tickPomodoro, 1000);
}

function tickPomodoro() {
  const remaining = computeRemainingSeconds();
  if (remaining > 0) {
    pomodoroSession.remainingSeconds = remaining;
    updatePomodoroDisplay();
    return;
  }

  clearInterval(pomodoroSession.intervalId);
  pomodoroSession.intervalId = null;

  // Si une autre fenêtre ouverte sur la même session a déjà géré la fin
  // (notification, etc.) une fraction de seconde plus tôt, on s'aligne
  // simplement dessus au lieu de notifier une seconde fois.
  const stored = readPersistedPomodoroSession();
  const alreadyHandledElsewhere = !stored || stored.endAt === null;
  if (alreadyHandledElsewhere) {
    reflectPomodoroSessionInThisWindow();
  } else {
    completePomodoro();
  }
}

// Pause/reprise en place : le décompte est figé (pas seulement masqué) sans
// jamais fermer ni déplacer la fenêtre — tout se passe dans l'écran Pomodoro
// lui-même, qu'il soit détaché ou non.
function pausePomodoro() {
  if (!pomodoroSession || pomodoroSession.endAt == null) return;
  clearInterval(pomodoroSession.intervalId);
  pomodoroSession.remainingSeconds = computeRemainingSeconds();
  pomodoroSession.endAt = null;
  pomodoroSession.intervalId = null;
  persistPomodoroSession();
  updatePomodoroPauseBtn();
}

function continuePomodoro() {
  if (!pomodoroSession || pomodoroSession.endAt != null) return;
  pomodoroSession.endAt = Date.now() + pomodoroSession.remainingSeconds * 1000;
  persistPomodoroSession();
  updatePomodoroPauseBtn();
  runPomodoroInterval();
}

function togglePomodoroPause() {
  if (!pomodoroSession) return;
  if (pomodoroSession.endAt != null) pausePomodoro();
  else continuePomodoro();
}

function updatePomodoroPauseBtn() {
  const isPaused = Boolean(pomodoroSession) && pomodoroSession.endAt == null && pomodoroSession.remainingSeconds > 0;
  pomodoroPauseBtn.textContent = isPaused ? "Reprendre" : "Mettre en pause";
}

function cancelPomodoroSession() {
  if (pomodoroSession) clearInterval(pomodoroSession.intervalId);
  pomodoroSession = null;
  persistPomodoroSession();
  closePomodoroOverlay();
  if (isPomodoroPopout) window.close();
  else render();
}

function completePomodoro() {
  clearInterval(pomodoroSession.intervalId);
  pomodoroSession.remainingSeconds = 0;
  pomodoroSession.endAt = null;
  pomodoroSession.intervalId = null;
  persistPomodoroSession();
  sendPomodoroNotification();
  showPomodoroCompletedState();
}

function showPomodoroCompletedState() {
  updatePomodoroDisplay();
  pomodoroStatusEl.hidden = false;
  pomodoroPauseBtn.hidden = true;
}

function updatePomodoroDisplay() {
  const remaining = pomodoroSession.remainingSeconds;
  const label = formatPomodoroTime(remaining);
  pomodoroTimeEl.textContent = label;
  const elapsedRatio = 1 - remaining / POMODORO_DURATION_SECONDS;
  pomodoroProgressFill.style.width = `${Math.min(100, Math.max(0, elapsedRatio * 100))}%`;
  // Rend le décompte visible même si la fenêtre est en arrière-plan/réduite.
  if (isPomodoroPopout) document.title = `${label} · Pomodoro`;
}

function openPomodoroOverlay() {
  pomodoroStatusEl.hidden = true;
  pomodoroPauseBtn.hidden = false;
  updatePomodoroPauseBtn();
  updatePomodoroDisplay();
  pomodoroBackdrop.hidden = false;
}

function closePomodoroOverlay() {
  pomodoroBackdrop.hidden = true;
  if (isPomodoroPopout) document.title = "Livre de quêtes";
  if (pomodoroPipWindow) pomodoroPipWindow.close(); // déclenche pagehide -> replace l'écran
}

// Fenêtre détachée du Pomodoro : Picture-in-Picture (vraiment "toujours au-
// dessus", mais Chrome/Edge uniquement) si le navigateur le permet, sinon
// une fenêtre classique comme avant.
async function openPomodoroPopout() {
  if ("documentPictureInPicture" in window) {
    try {
      await openPomodoroPip();
      return;
    } catch (err) {
      console.warn("Picture-in-picture indisponible, ouverture d'une fenêtre classique :", err);
    }
  }
  window.open(
    `${location.pathname}?pomodoro=popout`,
    "pomodoro-popout",
    "width=380,height=480,menubar=no,toolbar=no,location=no,status=no"
  );
}

// Contrairement à window.open, une fenêtre Picture-in-Picture partage le
// même contexte JS que l'onglet principal : on y déplace directement l'écran
// Pomodoro (même nœud DOM, mêmes écouteurs, même `pomodoroSession`), sans
// avoir besoin de synchroniser quoi que ce soit via localStorage.
async function openPomodoroPip() {
  if (pomodoroPipWindow && !pomodoroPipWindow.closed) {
    pomodoroPipWindow.focus();
    return;
  }

  const pip = await documentPictureInPicture.requestWindow({ width: 360, height: 420 });
  pomodoroPipWindow = pip;
  pip.document.title = "Pomodoro";
  pip.document.documentElement.dataset.theme = document.documentElement.dataset.theme;

  // Recopie les feuilles de style (police + style.css) : sans ça la fenêtre
  // flottante s'affiche sans aucun style.
  document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    pip.document.head.appendChild(link.cloneNode());
  });

  pip.document.body.classList.add("pomodoro-popout-mode"); // écran plein, sans cadre de modale
  const backdropHome = pomodoroBackdrop.parentNode;
  pip.document.body.appendChild(pomodoroBackdrop);
  pomodoroBackdrop.hidden = false; // cette fenêtre n'existe que pour l'afficher
  pomodoroPopoutBtn.hidden = true; // pas de pop-out depuis le pop-out

  pip.addEventListener(
    "pagehide",
    () => {
      pomodoroPipWindow = null; // évite un ré-appel de .close() depuis cancelPomodoroSession()
      // Fermer via la croix du pop-out doit se comporter exactement comme
      // "Revenir à la liste" : jamais de retour silencieux du chrono dans la
      // page principale. (Si la session a déjà été annulée depuis le
      // pop-out — "Revenir à la liste" a lui-même déclenché cette fermeture
      // — il n'y a rien de plus à faire ici.)
      if (pomodoroSession) cancelPomodoroSession();
      backdropHome.appendChild(pomodoroBackdrop); // remet le nœud dans la page principale, masqué
      pomodoroPopoutBtn.hidden = isPomodoroPopout;
    },
    { once: true }
  );
}

// Appelée quand la session Pomodoro a changé dans une autre fenêtre (via
// l'évènement "storage"), ou quand cette fenêtre perd la "course" à la fin
// du décompte (voir tickPomodoro). N'ouvre jamais l'écran de force dans la
// fenêtre principale si l'utilisateur regardait autre chose ; la fenêtre
// détachée, elle, n'existe QUE pour l'afficher.
function reflectPomodoroSessionInThisWindow() {
  if (pomodoroSession) clearInterval(pomodoroSession.intervalId);

  const stored = readPersistedPomodoroSession();
  if (!stored) {
    pomodoroSession = null;
    closePomodoroOverlay();
    if (isPomodoroPopout) {
      window.close();
      return;
    }
    render();
    return;
  }

  pomodoroSession = { endAt: stored.endAt, remainingSeconds: stored.remainingSeconds, intervalId: null };
  const shouldDisplay = isPomodoroPopout || !pomodoroBackdrop.hidden;

  if (shouldDisplay) {
    if (pomodoroSession.endAt != null) {
      openPomodoroOverlay();
      runPomodoroInterval();
    } else if (pomodoroSession.remainingSeconds > 0) {
      openPomodoroOverlay(); // affiche l'état "en pause" (bouton "Reprendre"), en place
    } else {
      openPomodoroOverlay();
      showPomodoroCompletedState();
    }
  }

  if (!isPomodoroPopout) render();
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
  modalDifficultyInput.value = task.difficulty ?? "";
  populateModalProjectOptions(task.projectId);
  modalSubtaskInput.value = "";
  renderModalSubtasks();
  modalTagsDraft = [...task.tags];
  modalTagInput.value = "";
  populateModalTagDatalist();
  renderModalTags();
  modalBackdrop.hidden = false;
  modalTitleInput.focus();
  modalTitleInput.select();
}

// Une quête créée sans titre (ajout rapide vide, puis fermée sans être
// nommée) n'a jamais été validée : on l'enlève plutôt que de laisser une
// quête fantôme dans la liste.
function closeTaskModal() {
  const task = getEditingTask();
  if (task && !task.text.trim()) {
    tasks = tasks.filter((t) => t.id !== task.id);
    saveTasks();
    render();
  }
  modalBackdrop.hidden = true;
  editingTaskId = null;
}

function getEditingTask() {
  return editingTaskId ? tasks.find((t) => t.id === editingTaskId) : null;
}

// Applique les champs du formulaire à la tâche éditée. Ne fait rien si le
// titre est vide (une tâche sans titre n'a pas de sens).
function applyTaskModalFields(task) {
  const trimmedTitle = modalTitleInput.value.trim();
  if (!trimmedTitle) return false;

  task.text = trimmedTitle;
  task.priority = modalPriorityInput.value;
  task.dueDate = modalDueInput.value || null;
  task.description = modalDescInput.value.trim();
  task.projectId = modalProjectInput.value || null;
  task.difficulty = modalDifficultyInput.value || null;
  task.tags = [...modalTagsDraft];
  return true;
}

function saveTaskModal() {
  const task = getEditingTask();
  if (!task) return;

  if (!applyTaskModalFields(task)) {
    modalTitleInput.focus();
    return;
  }

  saveTasks();
  render();
  closeTaskModal();
}

// Fermeture "douce" (✕, clic hors de la modale, Échap) : contrairement à
// "Annuler", elle n'écarte pas silencieusement les modifications en cours —
// elle les enregistre, comme le fait déjà l'édition des sous-tâches.
function closeTaskModalKeepingEdits() {
  const task = getEditingTask();
  if (task && applyTaskModalFields(task)) {
    saveTasks();
    render();
  }
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

// ---- Tags ----
// Contrairement aux sous-tâches, un simple brouillon (modalTagsDraft) tant
// que la modale est ouverte : appliqué à la tâche uniquement à
// l'enregistrement, comme le titre ou l'échéance (voir applyTaskModalFields).

function renderModalTags() {
  modalTagList.innerHTML = "";
  for (const tag of modalTagsDraft) {
    modalTagList.appendChild(renderTagChip(tag, { removable: true }));
  }
}

function renderTagChip(tag, { removable = false } = {}) {
  const li = document.createElement("li");
  li.className = "tag-chip";

  const label = document.createElement("span");
  label.textContent = tag;
  li.appendChild(label);

  if (removable) {
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "tag-chip-remove";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", `Retirer le tag ${tag}`);
    removeBtn.addEventListener("click", () => removeDraftTag(tag));
    li.appendChild(removeBtn);
  }

  return li;
}

function addDraftTag(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) return;
  if (modalTagsDraft.length >= MAX_TAGS_PER_TASK) {
    showToast(`Maximum ${MAX_TAGS_PER_TASK} tags par quête.`);
    return;
  }
  modalTagsDraft = sanitizeTags([...modalTagsDraft, trimmed]);
}

function removeDraftTag(tag) {
  modalTagsDraft = modalTagsDraft.filter((t) => t !== tag);
  renderModalTags();
}

// Autocomplétion : reprend les tags déjà utilisés ailleurs, pour éviter les
// quasi-doublons ("urgent" vs "Urgent") plutôt que les empêcher.
function populateModalTagDatalist() {
  modalTagDatalist.innerHTML = "";
  for (const tag of getAllTags()) {
    const option = document.createElement("option");
    option.value = tag;
    modalTagDatalist.appendChild(option);
  }
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

// Un projet créé sans nom (ajout rapide vide, puis fermé sans être nommé)
// n'a jamais été validé : on l'enlève plutôt que de laisser un projet
// fantôme dans la liste.
function closeProjectModal() {
  const project = getEditingProject();
  if (project && !project.name.trim()) {
    projects = projects.filter((p) => p.id !== project.id);
    saveProjects();
    render();
  }
  projectModalBackdrop.hidden = true;
  editingProjectId = null;
}

function getEditingProject() {
  return editingProjectId ? projects.find((p) => p.id === editingProjectId) ?? null : null;
}

// Applique les champs du formulaire au projet édité. Ne fait rien si le nom
// est vide (un projet sans nom n'a pas de sens).
function applyProjectModalFields(project) {
  const trimmedName = projectModalTitleInput.value.trim();
  if (!trimmedName) return false;

  project.name = trimmedName;
  project.description = projectModalDescInput.value.trim();
  return true;
}

function saveProjectModal() {
  const project = getEditingProject();
  if (!project) return;

  if (!applyProjectModalFields(project)) {
    projectModalTitleInput.focus();
    return;
  }

  saveProjects();
  render();
  closeProjectModal();
}

// Fermeture "douce" (✕, clic hors de la modale, Échap) : contrairement à
// "Annuler", elle enregistre les modifications en cours plutôt que de les
// écarter silencieusement.
function closeProjectModalKeepingEdits() {
  const project = getEditingProject();
  if (project && applyProjectModalFields(project)) {
    saveProjects();
    render();
  }
  closeProjectModal();
}

function deleteProjectModal() {
  if (!editingProjectId) return;
  deleteProject(editingProjectId);
  closeProjectModal();
}

// ---- Vue Matrice d'Eisenhower ----
// Classe les quêtes actives selon deux axes déduits des champs existants,
// sans ajouter de nouveau champ : l'urgence (échéance proche ou dépassée)
// et l'importance (catégorie autre que « Fond »).

function isTaskUrgent(task) {
  if (!task.dueDate) return false;
  return daysUntilDue(task.dueDate) <= MATRIX_URGENT_WITHIN_DAYS;
}

function isTaskImportant(task) {
  return task.priority !== "low";
}

function getMatrixQuadrant(task) {
  const urgent = isTaskUrgent(task);
  const important = isTaskImportant(task);
  if (urgent && important) return "do";
  if (important) return "schedule";
  if (urgent) return "delegate";
  return "eliminate";
}

function renderMatrixView() {
  matrixLegend.innerHTML =
    `<strong>Urgent</strong> : échéance dépassée, ou dans les ${MATRIX_URGENT_WITHIN_DAYS} prochains jours. ` +
    `<strong>Important</strong> : catégorie « Todo » ou « Urgent » (tout sauf « Fond »).`;

  const buckets = { do: [], schedule: [], delegate: [], eliminate: [] };
  for (const task of tasks) {
    if (task.status === "done") continue;
    buckets[getMatrixQuadrant(task)].push(task);
  }

  for (const quadrant of MATRIX_QUADRANTS) {
    const container = matrixLists[quadrant];
    container.innerHTML = "";

    const quadrantTasks = sortTasks(buckets[quadrant], "due");
    matrixCounts[quadrant].textContent = String(quadrantTasks.length);

    if (quadrantTasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "matrix-empty";
      empty.textContent = "Aucune quête";
      container.appendChild(empty);
      continue;
    }

    for (const task of quadrantTasks) {
      container.appendChild(renderTaskItem(task));
    }
  }
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

searchInputEl.addEventListener("input", () => {
  currentSearchQuery = searchInputEl.value.trim().toLowerCase();
  render();
});

viewNav.addEventListener("click", (e) => {
  const btn = e.target.closest(".view-link");
  if (!btn) return;
  switchView(btn.dataset.view);
  closeNavDrawer(); // no-op sur desktop (le tiroir n'y est jamais ouvert)
});

navToggleBtn.addEventListener("click", toggleNavDrawer);
navBackdrop.addEventListener("click", closeNavDrawer);

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
modalCloseBtn.addEventListener("click", closeTaskModalKeepingEdits);

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
projectModalCloseBtn.addEventListener("click", closeProjectModalKeepingEdits);

projectModalBackdrop.addEventListener("click", (e) => {
  if (e.target === projectModalBackdrop) closeProjectModalKeepingEdits();
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

pomodoroLaunchBtn.addEventListener("click", launchPomodoro);
pomodoroLaunchBtnProject.addEventListener("click", launchPomodoro);
pomodoroLaunchBtnNav.addEventListener("click", () => {
  launchPomodoro();
  closeNavDrawer();
});
pomodoroPauseBtn.addEventListener("click", togglePomodoroPause);
pomodoroCloseBtn.addEventListener("click", cancelPomodoroSession);
pomodoroPopoutBtn.addEventListener("click", openPomodoroPopout);

// Répercute dans cette fenêtre tout changement de la session Pomodoro fait
// depuis une autre fenêtre du même site (ex. la fenêtre détachée).
window.addEventListener("storage", (e) => {
  if (e.key === POMODORO_STORAGE_KEY) reflectPomodoroSessionInThisWindow();
});
pomodoroBackdrop.addEventListener("click", (e) => {
  if (e.target !== pomodoroBackdrop) return;
  if (pomodoroStatusEl.hidden) togglePomodoroPause();
  else cancelPomodoroSession();
});

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeTaskModalKeepingEdits();
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
  } else if (!pomodoroBackdrop.hidden) {
    if (pomodoroStatusEl.hidden) togglePomodoroPause();
    else cancelPomodoroSession();
  } else if (!modalBackdrop.hidden) {
    closeTaskModalKeepingEdits();
  } else if (!projectModalBackdrop.hidden) {
    closeProjectModalKeepingEdits();
  } else if (!navBackdrop.hidden) {
    closeNavDrawer();
  }
});

modalSubtaskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!editingTaskId) return;
  addSubtask(editingTaskId, modalSubtaskInput.value);
  modalSubtaskInput.value = "";
  modalSubtaskInput.focus();
});

modalTagForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!editingTaskId) return;
  // Autorise "urgent, client" pour poser plusieurs tags en une fois.
  const parts = modalTagInput.value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) addDraftTag(part);
  modalTagInput.value = "";
  renderModalTags();
  modalTagInput.focus();
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

if (isPomodoroPopout) {
  // Fenêtre détachée : rien d'autre que l'écran Pomodoro (voir .pomodoro-popout-mode
  // dans style.css). Si la session n'existe plus (terminée/annulée entre-temps
  // ailleurs), reflectPomodoroSessionInThisWindow() referme direct la fenêtre.
  document.body.classList.add("pomodoro-popout-mode");
  applyTheme(getTheme());
  reflectPomodoroSessionInThisWindow();
} else {
  setupKanbanDragTargets();
  applyTheme(getTheme()); // synchronise l'icône avec le thème déjà appliqué (script d'amorçage dans <head>)
  switchView(currentView); // synchronise l'UI et déclenche le premier rendu
}
