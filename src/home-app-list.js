// Mad Station — Hub companion registry
// ---------------------------------------------------------------------------
// Every full companion listed here appears in the left column and connects to
// the AI Hub circle through a signal line managed by home-core-system.js. Add a
// new one by copying a block below. The engine handles card sizing and overflow.
//
//   id           unique, lowercase, letters/numbers/dashes
//   name         card title
//   description  one line shown on full-size cards
//   chips        up to 6 short tags (strings; legacy { html: '…' } entries render as text)
//   iconSvg      inner markup of a 24×24 stroke icon (no <svg> wrapper), OR
//   iconUrl      path/URL of an image (e.g. 'assets/app-icons/my-app.svg')
//   launch       id passed to openWorkspaceApp() — defaults to `id`
//   open         optional function(app) — use it instead of `launch` for custom apps
//   hue          optional 0-5 to pin the accent shade (default: cycles by position)
//   order        optional number to change the position (lower = earlier)
//
// Custom apps need a way to open: either add a case for their id to
// openWorkspaceApp() in renderer.js, or pass `open: () => …` here.
(function () {
  const add = (app) => window.MadHomeApps.register(app);

  add({
    id: 'instruction-forge',
    name: 'Prompt Studio',
    description: 'Write sharper prompts before they reach your Hub.',
    chips: ['Refine', 'Clarify', 'Structure'],
    order: 10,
    iconSvg: '<path d="M5 6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4 3v-5.2a2 2 0 0 1-1-1.8v-5z"></path><path d="M8 8.5h7M8 11.5h5"></path><path d="m17 4 .55 1.65L19.2 6.2l-1.65.55L17 8.4l-.55-1.65L14.8 6.2l1.65-.55L17 4z"></path>',
  });

  add({
    id: 'ai-lab',
    name: 'AI Playground',
    description: 'Pit models head-to-head and find the best one for the job.',
    chips: ['Arena', 'API', 'Local AI'],
    order: 20,
    iconSvg: '<path d="M9 3h6M10 3v5l-4.6 9.1A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.8-2.9L14 8V3"></path><path d="M8 14h8"></path><circle cx="18.5" cy="6" r="1.1"></circle><circle cx="20.5" cy="9" r=".8"></circle>',
  });

  add({
    id: 'video-hub',
    name: 'Video Hub',
    description: 'Keep video generators and their account sessions in one isolated workspace.',
    chips: ['AI Video', 'Daily Credits', 'Isolated Sessions'],
    order: 30,
    iconSvg: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"></rect><path d="m10 9 5 3-5 3z"></path><path d="M7 3.5v2M17 3.5v2"></path>',
  });

  add({
    id: 'image-hub',
    name: 'Image Hub',
    description: 'Discover image generators, editors and upscalers in one visual workspace.',
    chips: ['AI Images', 'Edit', 'Upscale'],
    order: 40,
    iconSvg: '<rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>',
  });

  // ---- add more apps below ------------------------------------------------
  // add({
  //   id: 'my-app',
  //   name: 'My App',
  //   description: 'What it does, in one line.',
  //   chips: ['Tag', 'Tag'],
  //   iconSvg: '<circle cx="12" cy="12" r="8"></circle>',
  //   open: () => window.aiHub.setWorkspaceApp('my-app'),
  // });
})();
