const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Notifications React entry is included in Vite, renderer HTML, test command, and developer-source packaging', () => {
  const html = read('src/renderer.html');
  const vite = read('vite.config.ts');
  const pkg = JSON.parse(read('package.json'));
  assert.match(vite, /'notifications-react': resolve\(__dirname, 'src\/renderer-react\/notifications\.tsx'\)/);
  assert.match(html, /src="\.\.\/build\/notifications-react\.js"/);
  assert.match(pkg.scripts.test, /tests\/renderer-react-notifications\.test\.js/);
  assert.ok(pkg.build.extraResources.some((resource) => resource.from === 'src' && resource.filter?.includes('renderer-react/notifications.tsx')));
});

test('Notifications presentation renders empty and populated states with safe React text nodes', () => {
  const component = read('src/renderer-react/notifications.tsx');
  assert.match(component, /createRoot\(host\)/);
  assert.match(component, /model\.items\.length === 0/);
  assert.match(component, /No notifications/);
  assert.match(component, /Recent app events will appear here\./);
  assert.match(component, /className="notification-item"/);
  assert.match(component, /\{item\.title\}/);
  assert.match(component, /\{item\.message\}/);
  assert.match(component, /new Date\(item\.at\)\.toLocaleTimeString\(\)/);
  assert.match(component, /data-notice-index=\{item\.index\}/);
  assert.match(component, /aria-label="Dismiss"/);
  assert.match(component, /type="button"/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|\.innerHTML|window\.aiHub|localStorage/);
});

test('Host owns notification data, dismissal, clear actions and badge synchronization; React owns steady-state markup', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /function getNotificationsViewModel\(\)[\s\S]*?title: String\(notification\.title \|\| 'Mad Station'\)[\s\S]*?message: String\(notification\.message \|\| ''\)[\s\S]*?at: Number\(notification\.at\)/);
  assert.match(renderer, /window\.MadStationNotifications = \{[\s\S]*?attachReactRenderer\(renderer\)[\s\S]*?notificationsReactRenderer = renderer[\s\S]*?renderNotifications\(\)/);
  assert.match(renderer, /if \(typeof notificationsReactRenderer === 'function'\)\s*\{\s*notificationsReactRenderer\(model\);/);
  assert.match(renderer, /Startup fallback only until the React entry attaches/);
  assert.match(renderer, /\$\('notificationList'\)\?\.addEventListener\('click', \(event\) => \{[\s\S]*?target\.closest\('\[data-notice-index\]'\)[\s\S]*?Number\.isInteger\(index\)[\s\S]*?notifications\.splice\(index, 1\)[\s\S]*?renderNotifications\(\)/);
  assert.match(renderer, /\$\('clearNotificationsBtn'\)\?\.addEventListener\('click',\(\)=>\{notifications=\[\];renderNotifications\(\);\}\)/);
  assert.match(renderer, /function syncNotificationBadges\(\)[\s\S]*?Math\.min\(99, notifications\.length\)/);
  assert.doesNotMatch(renderer, /root\.querySelectorAll\('\[data-notice-index\]'\)/);
});

test('Notification cap and Video Hub native-overlay behavior remain in the trusted host', () => {
  const renderer = read('src/renderer.js');
  assert.match(renderer, /notifications\.unshift\(\{ message, title: 'Mad Station', at: Date\.now\(\) \}\); notifications=notifications\.slice\(0,50\); renderNotifications\(\)/);
  assert.match(renderer, /if \(openingApp === 'video-hub' && !notificationVideoHubOverlayOpen\)[\s\S]*?videoHubNotificationOverlay\(true\)/);
  assert.match(renderer, /if \(notificationVideoHubOverlayOpen\)[\s\S]*?videoHubNotificationOverlay\?\.\(false\)/);
});
