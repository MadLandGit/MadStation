// Mad Station — Home module definitions
// ---------------------------------------------------------------------------
// Add a workspace card, a quick-access button or a widget by copying a block.
// The engine in home.js does the layout, saving, search and Arrange for you.
//
// Workspace card  id, name, description, chips[], iconSvg (24×24 stroke paths) | iconUrl,
//                 launch (id for openWorkspaceApp, defaults to id), open() optional,
//                 hue 0-5 optional, order optional
// Quick access    id, name, iconSvg, launch, color optional, order optional
// Widget          id, title, size small|medium|large, order, render(panel)
(function () {
  'use strict';
  const { h, svgIcon } = window.MadHome;

  /* ------------------------------------------------------------ workspaces */
  const app = (def) => window.MadHomeApps.register(def);

  app({
    id: 'instruction-forge', name: 'Prompt Studio', order: 10,
    description: 'Write sharper prompts before they reach your Hub.',
    chips: ['Refine', 'Clarify', 'Structure'],
    iconSvg: '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-5.2a2 2 0 0 1-1-1.8v-5z"></path><path d="M8 8.5h7M8 11.5h5"></path><path d="m17 4 .55 1.65L19.2 6.2l-1.65.55L17 8.4l-.55-1.65L14.8 6.2l1.65-.55L17 4z"></path>',
  });
  app({
    id: 'ai-lab', name: 'AI Playground', order: 20,
    description: 'Pit models head-to-head and find the best one for the job.',
    chips: ['Arena', 'API', 'Local AI'],
    iconSvg: '<path d="M9 3h6M10 3v5l-4.6 9.1A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-2.9L14 8V3"></path><path d="M8 14h8"></path><circle cx="18.5" cy="6" r="1.1"></circle><circle cx="20.5" cy="9" r=".8"></circle>',
  });
  app({
    id: 'video-hub', name: 'Video Hub', order: 30,
    description: 'Keep video generators and their account sessions in one isolated workspace.',
    chips: ['AI Video', 'Daily Credits', 'Isolated Sessions'],
    iconSvg: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="m10 9 5 3-5 3z"></path><path d="M7 3.5v2M17 3.5v2"></path>',
  });
  app({
    id: 'image-hub', name: 'Image Hub', order: 40,
    description: 'Discover image generators, editors and upscalers in one visual workspace.',
    chips: ['AI Images', 'Edit', 'Upscale'],
    iconSvg: '<rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
  });

  /* --------------------------------------------------------------- widgets */
  const ICON_REFRESH = '<path d="M20 12a8 8 0 1 1-2.6-5.9"></path><path d="M20 4v5h-5"></path>';
  const ICON_LEAF = '<path d="M12 3c4.5 3 6.5 6 6.5 9.2A6.5 6.5 0 0 1 12 19a6.5 6.5 0 0 1-6.5-6.8C5.5 9 7.5 6 12 3z"></path><path d="M12 10v6"></path>';

  const memory = (action) => window.MadHome.memoryAction(action);
  const iconButton = (label, icon, onClick) => h('button', { class: 'hm-icon-btn hm-icon-btn--sm', type: 'button', title: label, 'aria-label': label, onclick: onClick }, svgIcon(icon));
  const setText = (root, slot, value) => { const n = root.querySelector(`[data-s="${slot}"]`); if (n && n.textContent !== String(value)) n.textContent = String(value); };
  const ringAngle = (percent) => `${Math.max(0, Math.min(100, Number(percent) || 0)) * 3.6}deg`;

  // Large: full system performance panel, fed by the same memory model the old Home used.
  function ramPanel(panel) {
    const legend = [['main', 'Main process'], ['browser', 'AI browsers'], ['gpu', 'GPU'], ['other', 'UI & other']];
    const procs = h('ul', { class: 'ram-procs', hidden: true, 'aria-label': 'Process memory' });
    const procToggle = h('button', { class: 'hm-link-btn', type: 'button', 'aria-expanded': 'false', onclick: () => {
      procs.hidden = !procs.hidden; procToggle.setAttribute('aria-expanded', String(!procs.hidden));
      procToggle.firstChild.textContent = procs.hidden ? 'Show processes' : 'Hide processes';
    } }, h('span', null, 'Show processes'));
    const root = h('div', { class: 'ram', 'data-level': 'low' },
      h('div', { class: 'ram-top' },
        h('div', { class: 'ring', 'data-s-ring': '' }, h('strong', { 'data-s': 'percent' }, '—'), h('span', null, 'of RAM')),
        h('div', { class: 'ram-read' },
          h('span', { class: 'ram-label' }, h('i', { class: 'live-dot', 'aria-hidden': 'true' }), 'App memory'),
          h('strong', { class: 'ram-total', 'data-s': 'total' }, 'Measuring…'),
          h('small', { 'data-s': 'summary' }, 'Waiting for metrics…')),
        h('span', { class: 'ram-tools' },
          iconButton('Reclaim unused memory', ICON_LEAF, () => memory('cleanup')),
          iconButton('Refresh', ICON_REFRESH, () => memory('refresh')))),
      h('div', { class: 'ram-cpu', 'data-cpu-level': 'unknown' },
        h('div', null, h('span', null, 'Processor'), h('strong', { 'data-s': 'cpu' }, 'Sampling…')),
        h('div', { class: 'meter', role: 'meter', 'aria-label': 'System CPU use', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { 'data-s-cpu-bar': '' }))),
      h('div', { class: 'ram-spark', 'aria-hidden': 'true' },
        h('small', null, 'Last 2 minutes'),
        (() => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 120 40'); svg.setAttribute('preserveAspectRatio', 'none');
          const area = document.createElementNS(svg.namespaceURI, 'path'); area.setAttribute('class', 'spark-area'); area.dataset.sArea = '';
          const line = document.createElementNS(svg.namespaceURI, 'path'); line.setAttribute('class', 'spark-line'); line.dataset.sLine = '';
          svg.append(area, line); return svg;
        })()),
      h('div', { class: 'ram-bar', 'aria-hidden': 'true' }, legend.map(([k]) => h('i', { data: { seg: k } }))),
      h('ul', { class: 'ram-legend', 'aria-label': 'Memory breakdown' }, legend.map(([k, label]) => h('li', { data: { seg: k } }, h('i', { 'aria-hidden': 'true' }), h('span', null, label), h('strong', { 'data-s': k }, '—')))),
      h('p', { class: 'ram-note' }, 'Arena browsers use ', h('b', { 'data-s': 'arena' }, '—'), ' · clip buffer ≈ ', h('b', { 'data-s': 'clipboard' }, '—')),
      h('div', { class: 'ram-foot' }, h('span', { 'data-s': 'sessions' }, 'Browser sessions: —'), procToggle),
      procs);

    window.MadHome.onMemory((m) => {
      const hm = m.home || {};
      setText(root, 'percent', m.percentLabel ?? '—');
      setText(root, 'total', m.totalLabel ?? '—');
      setText(root, 'summary', m.summaryLabel ?? '');
      setText(root, 'main', m.mainLabel ?? '—'); setText(root, 'browser', m.browserLabel ?? '—');
      setText(root, 'gpu', m.gpuLabel ?? '—'); setText(root, 'other', hm.otherLabel ?? '—');
      setText(root, 'arena', m.arenaLabel ?? '—'); setText(root, 'clipboard', m.clipboardLabel ?? '—');
      setText(root, 'sessions', m.sessionsLabel ?? '');
      setText(root, 'cpu', m.systemCpuLabel ?? '—');
      root.dataset.level = hm.level || 'low';
      root.querySelector('[data-s-ring]').style.setProperty('--p', ringAngle(m.appPercent));
      const cpu = m.systemCpuPercent;
      const cpuBox = root.querySelector('.ram-cpu');
      cpuBox.dataset.cpuLevel = cpu == null ? 'unknown' : cpu >= 80 ? 'high' : cpu >= 50 ? 'mid' : 'low';
      root.querySelector('[data-s-cpu-bar]').style.width = `${cpu ?? 0}%`;
      const meter = root.querySelector('.meter');
      if (cpu == null) meter.removeAttribute('aria-valuenow'); else meter.setAttribute('aria-valuenow', String(cpu));
      meter.setAttribute('aria-valuetext', m.systemCpuLabel || '');
      root.querySelector('[data-s-line]').setAttribute('d', hm.sparkLine || '');
      root.querySelector('[data-s-area]').setAttribute('d', hm.sparkArea || '');
      const shares = { main: hm.mainShare, browser: hm.browserShare, gpu: hm.gpuShare, other: hm.otherShare };
      root.querySelectorAll('.ram-bar i').forEach((seg) => { seg.style.flexGrow = String(shares[seg.dataset.seg] || 0); });
      const rows = Array.isArray(m.processRows) ? m.processRows : [];
      procs.replaceChildren(...(rows.length
        ? rows.slice(0, 40).map((r) => h('li', null, h('span', null, r.name), h('strong', null, r.ram)))
        : [h('li', { class: 'ram-procs-empty' }, 'Process metrics unavailable.')]));
    });
    panel.append(root);
  }

  // Small: compact view of the same stream — no extra polling.
  function miniPanel(panel) {
    const root = h('div', { class: 'mini', 'data-level': 'low' },
      h('div', { class: 'mini-top' }, h('span', { class: 'ram-label' }, h('i', { class: 'live-dot', 'aria-hidden': 'true' }), 'Live'), h('span', { class: 'mini-top-right' }, h('strong', { 'data-s': 'percent' }, '—'), h('button', { class: 'hm-icon-btn hm-icon-btn--sm mini-refresh-btn', type: 'button', title: 'Refresh process monitor', 'aria-label': 'Refresh process monitor', 'data-memory-refresh': '' }, svgIcon(ICON_REFRESH)))),
      h('div', { class: 'mini-main' },
        h('div', { class: 'ring ring--sm', 'data-s-ring': '' }),
        h('div', { class: 'ram-read' }, h('span', { class: 'ram-label' }, 'App memory'), h('strong', { 'data-s': 'total' }, 'Measuring…'))),
      h('small', { class: 'mini-sum', 'data-s': 'summary' }, 'Waiting for metrics…'),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { 'data-s-bar': '' })));
    window.MadHome.onMemory((m) => {
      setText(root, 'percent', m.percentLabel ?? '—'); setText(root, 'total', m.compactTotalLabel || m.totalLabel || '—'); setText(root, 'summary', m.summaryLabel ?? '');
      root.dataset.level = m.home?.level || 'low';
      root.querySelector('[data-s-ring]').style.setProperty('--p', ringAngle(m.appPercent));
      root.querySelector('[data-s-bar]').style.width = `${Math.max(0, Math.min(100, Number(m.appPercent) || 0))}%`;
    });
    panel.append(root);
  }

  const NOTES_TASKS_ICON = '<rect x="4" y="5" width="13" height="15" rx="2"></rect><path d="M8 9h6M8 12h5M8 15h4"></path><circle cx="18" cy="16" r="4"></circle><path d="m16.4 16 1.1 1.1 2.2-2.3"></path>';
  function notesTasksPanel(panel) {
    const launch = () => window.MadHomeApps?.launchTarget?.('clipboard');
    const button = h('button', {
      class: 'hm-notes-widget-launch', type: 'button',
      'aria-label': 'Open Notes and Tasks workspace',
      onclick: launch,
    },
      h('span', { class: 'hm-notes-widget-icon', 'aria-hidden': 'true' }, svgIcon(NOTES_TASKS_ICON)),
      h('span', { class: 'hm-notes-widget-copy' },
        h('strong', null, 'Capture ideas. Keep moving.'),
        h('span', null, 'Your notes, checklists, and tasks in one workspace.'),
        h('span', { class: 'hm-notes-widget-cta' }, 'Open Notes and Tasks', svgIcon('<path d="M5 12h14M13 6l6 6-6 6"></path>'))),
    );
    panel.append(button);
  }

  window.MadHomeWidgets.register({ id: 'ram-monitor', title: 'System performance', size: 'large', order: 10, render: ramPanel });
  window.MadHomeWidgets.register({ id: 'performance-mini', title: 'Performance · Mini', size: 'small', order: 20, render: miniPanel });
  window.MadHomeWidgets.register({ id: 'notes-tasks', title: 'Notes and Tasks', size: 'medium', order: 30, render: notesTasksPanel });
})();
