/*
 * Seed CAPEX project, embedded as a plain script (not fetched as JSON) so it
 * loads correctly when index.html is opened directly via file:// — browsers
 * block fetch()/XHR of local files under file:// even though plain <script>
 * tags load fine. Same shape as a project exported via "Save to File".
 */
window.CG_SEED_PROJECT = {
  fileFormatVersion: 1,
  project: {
    id: 'seed-plant-renovation-line3',
    name: 'Plant Renovation – Line 3 CAPEX',
    categories: [
      { id: 'cat-procurement', name: 'Procurement', color: '#1976d2' },
      { id: 'cat-civil', name: 'Civil', color: '#ef6c00' },
      { id: 'cat-installation', name: 'Installation', color: '#2e7d32' },
      { id: 'cat-commissioning', name: 'Commissioning', color: '#7b1fa2' }
    ],
    customFieldDefs: [
      { id: 'cf-po', name: 'PO Number', type: 'text' },
      { id: 'cf-vendor', name: 'Vendor', type: 'text' }
    ],
    tasks: [
      {
        id: 'p-procurement', parentId: null, order: 1000, type: 'task',
        name: 'Procurement', start: '2026-08-01', end: '2026-11-11', progress: 45,
        assignee: '', categoryId: 'cat-procurement', color: null,
        dependencies: [], budget: null, actualCost: null, notes: 'Phase rollup: RFQ through equipment delivery.',
        customFields: {}, collapsed: false
      },
      {
        id: 't01', parentId: 'p-procurement', order: 1000, type: 'task',
        name: 'Vendor RFQ & Selection', start: '2026-08-01', end: '2026-08-14', progress: 100,
        assignee: 'S. Ahmed', categoryId: 'cat-procurement', color: null,
        dependencies: [], budget: 150000, actualCost: 148500, notes: '3 vendors quoted; lowest compliant bid selected.',
        customFields: { 'cf-vendor': 'Atlas Industrial Co.' }, collapsed: false
      },
      {
        id: 't02', parentId: 'p-procurement', order: 2000, type: 'milestone',
        name: 'Purchase Order Issued', start: '2026-08-15', end: '2026-08-15', progress: 100,
        assignee: 'S. Ahmed', categoryId: 'cat-procurement', color: null,
        dependencies: [{ predecessorId: 't01', type: 'FS', lagDays: 0 }],
        budget: null, actualCost: null, notes: '',
        customFields: { 'cf-po': 'PO-2026-0451', 'cf-vendor': 'Atlas Industrial Co.' }, collapsed: false
      },
      {
        id: 't03', parentId: 'p-procurement', order: 3000, type: 'task',
        name: 'Equipment Manufacturing Lead Time', start: '2026-08-16', end: '2026-11-10', progress: 35,
        assignee: 'S. Ahmed', categoryId: 'cat-procurement', color: null,
        dependencies: [{ predecessorId: 't02', type: 'FS', lagDays: 0 }],
        budget: 4500000, actualCost: 1600000, notes: 'Vendor confirmed 12-week lead time.',
        customFields: { 'cf-po': 'PO-2026-0451', 'cf-vendor': 'Atlas Industrial Co.' }, collapsed: false
      },
      {
        id: 't06', parentId: 'p-procurement', order: 4000, type: 'milestone',
        name: 'Equipment Delivery to Site', start: '2026-11-11', end: '2026-11-11', progress: 0,
        assignee: 'S. Ahmed', categoryId: 'cat-procurement', color: null,
        dependencies: [{ predecessorId: 't03', type: 'FS', lagDays: 0 }],
        budget: null, actualCost: null, notes: '', customFields: {}, collapsed: false
      },

      {
        id: 'p-civil', parentId: null, order: 2000, type: 'task',
        name: 'Civil Works', start: '2026-08-04', end: '2026-08-29', progress: 46,
        assignee: '', categoryId: 'cat-civil', color: null,
        dependencies: [], budget: null, actualCost: null, notes: 'Phase rollup: foundation & utilities through sign-off.',
        customFields: {}, collapsed: false
      },
      {
        id: 't04', parentId: 'p-civil', order: 1000, type: 'task',
        name: 'Site Civil Works (Foundation & Utilities)', start: '2026-08-04', end: '2026-08-26', progress: 55,
        assignee: 'M. Farooq', categoryId: 'cat-civil', color: null,
        dependencies: [{ predecessorId: 't01', type: 'SS', lagDays: 3 }],
        budget: 850000, actualCost: 510000, notes: 'Behind schedule – rebar delivery delayed one week.',
        customFields: {}, collapsed: false
      },
      {
        id: 't05', parentId: 'p-civil', order: 2000, type: 'milestone',
        name: 'Civil Works Inspection Sign-off', start: '2026-08-29', end: '2026-08-29', progress: 0,
        assignee: 'M. Farooq', categoryId: 'cat-civil', color: null,
        dependencies: [{ predecessorId: 't04', type: 'FS', lagDays: 0 }],
        budget: null, actualCost: null, notes: '', customFields: {}, collapsed: false
      },

      {
        id: 'p-install', parentId: null, order: 3000, type: 'task',
        name: 'Installation & Commissioning', start: '2026-11-12', end: '2026-12-18', progress: 0,
        assignee: '', categoryId: null, color: '#546e7a',
        dependencies: [], budget: null, actualCost: null, notes: 'Phase rollup: mechanical/electrical install through handover.',
        customFields: {}, collapsed: false
      },
      {
        id: 't07', parentId: 'p-install', order: 1000, type: 'task',
        name: 'Mechanical Installation', start: '2026-11-12', end: '2026-11-28', progress: 0,
        assignee: 'R. Iqbal', categoryId: 'cat-installation', color: null,
        dependencies: [
          { predecessorId: 't06', type: 'FS', lagDays: 0 },
          { predecessorId: 't05', type: 'FS', lagDays: 0 }
        ],
        budget: 620000, actualCost: 0, notes: '', customFields: {}, collapsed: false
      },
      {
        id: 't08', parentId: 'p-install', order: 2000, type: 'task',
        name: 'Electrical & Controls Integration', start: '2026-11-23', end: '2026-12-05', progress: 0,
        assignee: 'R. Iqbal', categoryId: 'cat-installation', color: null,
        dependencies: [{ predecessorId: 't07', type: 'SS', lagDays: 8 }],
        budget: 410000, actualCost: 0, notes: '', customFields: {}, collapsed: false
      },
      {
        id: 't09', parentId: 'p-install', order: 3000, type: 'task',
        name: 'Commissioning & Test Run', start: '2026-12-07', end: '2026-12-17', progress: 0,
        assignee: 'N. Sheikh', categoryId: 'cat-commissioning', color: null,
        dependencies: [{ predecessorId: 't08', type: 'FS', lagDays: 0 }],
        budget: 180000, actualCost: 0, notes: '', customFields: {}, collapsed: false
      },
      {
        id: 't10', parentId: 'p-install', order: 4000, type: 'milestone',
        name: 'Handover to Operations', start: '2026-12-18', end: '2026-12-18', progress: 0,
        assignee: 'N. Sheikh', categoryId: 'cat-commissioning', color: null,
        dependencies: [{ predecessorId: 't09', type: 'FS', lagDays: 0 }],
        budget: null, actualCost: null, notes: '', customFields: {}, collapsed: false
      }
    ],
    settings: {
      weekStart: 'mon',
      dateFormat: 'dd/MM/yyyy',
      rowHeight: 32,
      barHeight: 20,
      fontSize: 13,
      theme: 'light',
      visibleColumns: ['category', 'start', 'end', 'duration', 'progress'],
      defaultZoom: 'month'
    }
  }
};
