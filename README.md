# CAPEX Gantt

A fully local, offline Gantt chart builder for tracking CAPEX project timelines — engineering/construction phases, procurement milestones, vendor lead times, and budget-linked tasks. No install, no server, no account, no internet connection required after you've copied the folder.

## 1. Running it

There is nothing to install and nothing to build.

1. Copy the whole `capex-gantt-app` folder anywhere you like (Desktop, a network drive, a USB stick — it's fully self-contained).
2. Double-click **`index.html`** (or **`Start CAPEX Gantt.bat`**, which does the same thing). It opens in your default browser (Edge or Chrome).

That's it. There's no `npm install`, no Node.js, no dev server — every dependency is a plain file already inside this folder (`vendor/exceljs.min.js` is the one third-party library, used only for the Excel export/import, and it's already bundled here — nothing is fetched from the internet at runtime).

If you ever move or edit the files, just refresh the browser tab — there's no build step to re-run.

### Trying it with a larger project

`sample-data/large-test-project.json` is a synthetic 59-row project (52 leaf tasks + 7 phases, 6 categories, a mix of FS/SS/FF dependencies, 10 milestones, custom fields, and a ~17-month span) for checking how the table, chart, and exports hold up on something bigger than the small seed example. Load it via **Load from File** in the toolbar.

### Why not an installed app?

The original plan was an Electron desktop app, but Node.js/npm can't be installed on this machine (IT policy), which rules out any build tooling. This version trades a native `.exe` for a zero-install folder that runs directly in the browser you already have — the same approach the other hand-built dashboards in this project folder already use successfully.

## 2. Where your data lives

- **Autosave**: every change (adding a task, dragging a bar, editing a field) is saved automatically to your browser's local storage a few hundred milliseconds after you make it. Reopening `index.html` later restores exactly where you left off — including every open project tab.
- **This autosave is tied to the browser profile on this PC**, not to a file on disk. It is *not* a substitute for a real backup — clearing your browser's site data, or opening the app in a different browser/profile, will not show your autosaved work.
- **Your real backup is the "Save to File" button.** It writes the current project as a `.json` file — either through a normal Windows Save dialog (Edge/Chrome support saving straight back to the same file each time, like a native app) or, if that's unavailable, as a browser download into your Downloads folder. Use **"Load from File"** to reopen one later, on this PC or any other.
- **Export to Excel** produces a real `.xlsx` file the same way (Save dialog, or Downloads folder fallback).
- Nothing is ever sent anywhere. Everything happens inside your browser tab.

**Practical advice:** save a `.json` backup after any significant editing session, and keep it somewhere you'd keep any other project file (a project folder, a network drive, etc.). Treat autosave as a convenience, not a backup.

## 3. Using the app

- **Task table (left)** and **Gantt chart (right)** are two views of the same data — edit either one and the other updates instantly.
- **Add Task / Add Milestone** in the toolbar; **Indent/Outdent** turn a task into a sub-task of the row above it (or promote it back out), building a Project → Phase → Task hierarchy. Click the ▾/▸ next to a phase to collapse/expand it.
- **Reorder rows** by grabbing the ⋮⋮ handle that appears on the left of a row when you hover over it, and dragging it up/down — drop above or below another row to move it there. This only reorders siblings at the same level (e.g. tasks within the same phase); it never changes what a task is nested under — use Indent/Outdent for that.
- **Drag a bar** to reschedule it; **drag its edges** to resize (change duration); **drag from the small circle at a bar's end** to another task's circle to create a dependency (the app infers Finish-to-Start / Start-to-Start / Finish-to-Finish / Start-to-Finish from which edges you connect, and rejects anything that would create a circular dependency).
- **Double-click a row** (or click its Predecessors/Notes cell) to open the full task editor — all fields, dependency list with lag days, and any custom fields you've defined.
- **Zoom** (Day/Week/Month/Quarter/Year), **Today** (scrolls to the current date), and **Critical Path** (highlights the sequence of tasks with zero schedule slack — the tasks that, if delayed, delay the whole project) are in the toolbar.
- **Rename a project** either way: double-click its tab at the top, or open **Settings (⚙) → Project name**.
- **Settings (⚙)** lets you rename the project, change theme (light/dark/system), date format, week-start day, row/bar/font sizes, which table columns are visible, manage categories (name + color), and manage custom fields.
- **Import CSV/Excel** opens a column-mapping wizard — it auto-matches common header names (Start Date, Progress %, Budget, etc.), lets you map anything else to a custom field, and shows a preview before committing.
- **Export as Image** also opens a column picker — the same field list as the Excel one, but it controls which fields show up as extra text columns beside the task names in the picture (the bars/milestones/arrows themselves are always drawn). It defaults to whatever columns are currently visible in your on-screen table, since the point of an image export is to look like a clean chart, not a full data dump — pick fewer for a tidier slide, or add more (Budget, Assignee, custom fields, etc.) if the picture needs to stand alone. There's also a checkbox to leave out the "Generated on {date}" line under the title. Produces a single clean PNG — task names, columns, bars, milestones, dependency arrows, today marker, and (if the Critical Path toggle is on) the highlighted critical chain, all on a plain white background with no toolbar/table chrome. This is the one to use for a slide deck — the Excel export's colored-cell "Gantt" sheet is a real spreadsheet meant for filtering/editing in Excel, not for pasting into a presentation. Just Insert → Picture in PowerPoint (or paste directly).
- **Export to Excel** opens a column picker first — check off which fields you want in the **Tasks** sheet (Type, Category, dates, Progress, Assignee, Budget, Actual Cost, Predecessors, Notes, and any custom fields); Task Name is always included. Use it to leave out anything sensitive or irrelevant (e.g. drop Budget/Actual Cost before sharing externally) without touching your on-screen table. Your last selection is remembered per project. This only trims the **Tasks** sheet — the **Gantt** and **Summary** sheets always include everything they need to render correctly.
- **Undo/Redo** (toolbar buttons or Ctrl+Z / Ctrl+Y) cover task edits, drags, dependency changes, and imports. Purely cosmetic changes (zoom level, which row is selected, scroll position, panel width) are deliberately not part of the undo history.
- Multiple projects can be open at once as tabs along the top; each has its own independent undo history.

## 4. The data model

A project is one JSON object with this shape (see `sample-data/seed-project.js` for a full worked example):

```js
Project = {
  id, name,
  categories:       [{ id, name, color }],                 // e.g. Procurement, Civil, Installation, Commissioning
  customFieldDefs:  [{ id, name, type, options?, defaultValue? }], // type: 'text' | 'number' | 'date' | 'select'
  tasks:            [Task, ...],
  settings: {
    weekStart, dateFormat, rowHeight, barHeight, fontSize,
    theme, visibleColumns, defaultZoom
  }
}

Task = {
  id, parentId,        // hierarchy — null parentId = top-level
  order,                // sibling sort order
  type,                 // 'task' | 'milestone'
  name, start, end,     // ISO dates 'YYYY-MM-DD'; a milestone has start === end
  progress,             // 0-100
  assignee, categoryId, color,   // color overrides the category's color when set
  dependencies,         // [{ predecessorId, type: 'FS'|'SS'|'FF'|'SF', lagDays }]
  budget, actualCost, notes,
  customFields,         // { [customFieldDefId]: value }
  collapsed              // parent tasks only
}
```

Notes on a few deliberate design choices:

- **Duration is never stored** — it's always computed from `start`/`end` (inclusive day count). Editing the Duration cell just recomputes `end`.
- **A task's own `start`/`end` are what you see and drag on the chart.** A phase/parent task's displayed bar, dates, and % complete are always computed live from its children (min start, max end, duration-weighted progress) — you don't edit those directly, you edit the leaf tasks underneath.
- **Critical path** uses the Critical Path Method (forward/backward pass, all four dependency types, lag-aware) over leaf tasks only, and treats each task's *own* manually-set start as a hard floor only for tasks with no predecessors — everything downstream is scheduled purely from the dependency chain. This is what makes the highlighted path reflect the actual longest chain through your project, not just "whichever task happens to have no slack left over from how you dragged it."
- A `.json` export wraps the project as `{ fileFormatVersion: 1, project }`, so the file format can be migrated later without breaking old exports.

## 5. Extending it

Everything is plain JavaScript under `js/`, loaded as ordinary `<script>` tags (no bundler, no modules — that's a deliberate constraint so the app keeps working with zero tooling). Each file attaches its own piece to a single global, `window.CG`.

**Add a new custom field** (e.g. "Vendor Contract #"): Settings → Custom Fields → "+ Add custom field". It immediately becomes editable per-task (in the table, once you toggle its column on, and in the task editor modal) and appears as its own column in the "Tasks" sheet of every Excel export. No code changes needed.

**Add a new project**: "+ Project" in the top bar, or duplicate `sample-data/seed-project.js` as a starting template and load it via "Load from File" (rename the `.js` extension aside — that file is just documentation/seed data; the app itself only reads/writes plain `.json`).

**Add a new built-in table column**: add an entry to `builtinColumns()` in `js/taskTable.js` (needs `id`, `label`, `width`, `kind`, `getValue`, and usually `setValue`) — it'll automatically show up in the Settings column-visibility list and in the Excel "Tasks" sheet if you also add it to `buildTasksSheet` in `js/excelExport.js`.

**Change how the Gantt bars look**: `js/ganttChart.js` builds the whole chart as plain SVG elements (`buildTaskBar`, `buildParentBar`, `buildMilestone`) — no charting library involved, so anything is editable directly.

### File map

```
index.html              App shell — loads everything else in order
css/styles.css           All styling, incl. light/dark theme variables
vendor/exceljs.min.js    Third-party library (Excel read/write) — vendored, not fetched at runtime
sample-data/seed-project.js   The example CAPEX project loaded on first run
js/
  idGen.js                Unique IDs, sibling ordering
  dateUtils.js             Date math/formatting (no timezone library needed)
  csvParser.js              Hand-written CSV parser
  dependencyUtils.js         Dependency cycle detection
  criticalPath.js             Critical Path Method engine
  ganttLayout.js               Date <-> pixel conversion, header tick generation
  persistence.js                localStorage autosave + file save/open (native dialog or download fallback)
  state.js                       The data store: projects, undo/redo, all task/category/field mutations
  taskTable.js                    The spreadsheet-like left panel
  ganttChart.js                    The SVG timeline (bars, milestones, arrows, today marker, critical path)
  dragInteractions.js               Drag-to-move / resize / draw-dependency pointer handling
  taskEditModal.js                   The full task editor dialog
  settingsPanel.js                    Theme/columns/sizes/categories/custom fields
  projectSelector.js                   Project tabs, new/open/close
  excelExport.js                        Builds the 3-sheet .xlsx workbook
  excelImport.js                         CSV/Excel import + column-mapping wizard
  app.js                                  Wires everything together, toolbar, keyboard shortcuts, toasts
```

## 6. Known limitations

- Autosave lives in browser local storage, which is per-browser-profile and can be cleared by the browser or by clearing site data — always keep a `.json` export of anything important.
- The "Save in place" (overwrite the same file directly) behavior needs a Chromium-based browser (Edge, Chrome). It degrades automatically to a normal download in other browsers or if the feature is blocked by policy — nothing breaks, you just get a new file in Downloads each time instead of a silent overwrite.
- Import matches a row's "Category" text against your project's *existing* category names; it won't invent new categories on the fly (create the category first in Settings if needed).
