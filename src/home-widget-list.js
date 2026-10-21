// Widget registry — live panels stacked in the launcher's right column.
// Recipe and field guide: docs/architecture/CORE_SYSTEM.md → “Add a widget”.
// Required: id, title, size (small/medium/large), order, render(panel).
(function () {
  const add = (widget) => window.MadHomeWidgets.register(widget);

  add({
    id: 'ram-monitor',
    title: 'System performance',
    size: 'large',
    order: 10,
    // Preserve the existing monitor pipeline, mount ID, markup, and data hooks.
    render(panel) {
      const mount = document.createElement('div');
      mount.className = 'home-tele-mount home-widget-ram-mount';
      mount.id = 'launcherRamMonitorMount';
      panel.appendChild(mount);
    },
  });

  add({
    id: 'performance-mini',
    title: 'Performance · Mini',
    size: 'small',
    order: 20,
    // Lightweight view of the SAME memory snapshot stream; no duplicate polling.
    render(panel) {
      const monitor = document.createElement('section');
      monitor.className = 'home-performance-mini';
      monitor.dataset.memoryMonitor = '';
      monitor.dataset.memoryScope = 'mini';
      monitor.setAttribute('aria-label', 'Compact live system performance');
      monitor.innerHTML = `
        <div class="home-performance-mini-top">
          <span class="home-performance-mini-status"><i aria-hidden="true"></i> LIVE</span>
          <span class="home-performance-mini-percent" data-memory-slot="percent">—</span>
        </div>
        <div class="home-performance-mini-main">
          <div class="home-performance-mini-ring" data-memory-slot="ring" aria-hidden="true"></div>
          <div class="home-performance-mini-readout">
            <span>App memory</span>
            <strong data-memory-slot="total">Measuring…</strong>
            <small data-memory-slot="summary">Waiting for metrics…</small>
          </div>
        </div>
        <div class="home-performance-mini-meter" aria-hidden="true"><i data-memory-slot="meter"></i></div>`;
      panel.appendChild(monitor);
    },
  });

  add({
    id: 'notes-tasks',
    title: 'Notes & Tasks',
    size: 'medium',
    order: 15,
    // A focused launcher widget: the whole card opens the existing Notes app.
    // Notes business logic and persistence remain owned by the Notes workspace.
    render(panel) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'home-notes-widget-launch';
      button.setAttribute('aria-label', 'Open Notes and Tasks workspace');
      button.title = 'Open Notes & Tasks';
      button.innerHTML = `
        <span class="home-notes-widget-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="4.5" width="13" height="16" rx="2"></rect>
            <path d="M8 9h5M8 12.5h5M8 16h3"></path>
            <circle cx="18" cy="16.5" r="3.5"></circle>
            <path d="m16.6 16.5 1 1 1.8-2"></path>
          </svg>
        </span>
        <span class="home-notes-widget-copy">
          <strong>Capture ideas. Keep moving.</strong>
          <span class="home-notes-widget-description">Your notes, checklists, and tasks in one workspace.</span>
          <span class="home-notes-widget-cta">Open Notes and Tasks
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
          </span>
        </span>`;
      button.addEventListener('click', () => window.MadHomeApps?.launchTarget?.('clipboard'));
      panel.appendChild(button);
    },
  });

  // Register future live panels here; no engine edits are required.
})();
