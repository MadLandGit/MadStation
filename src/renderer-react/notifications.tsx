import { createRoot, type Root } from 'react-dom/client';

export interface NotificationItemModel {
  index: number;
  title: string;
  message: string;
  at: number;
}

export interface NotificationsModel {
  items: NotificationItemModel[];
}

export interface NotificationsBridge {
  attachReactRenderer(renderer: (model: NotificationsModel) => void): void;
}

declare global {
  interface Window {
    MadStationNotifications?: NotificationsBridge;
  }
}

function NotificationsList({ model }: { model: NotificationsModel }) {
  if (model.items.length === 0) {
    return (
      <div className="empty-state">
        <strong>No notifications</strong>
        <span>Recent app events will appear here.</span>
      </div>
    );
  }

  return (
    <>
      {model.items.map((item) => (
        <div className="notification-item" key={`${item.at}-${item.index}`}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.message}</span>
            <small>{new Date(item.at).toLocaleTimeString()}</small>
          </div>
          <button type="button" data-notice-index={item.index} aria-label="Dismiss">×</button>
        </div>
      ))}
    </>
  );
}

function mountNotifications(): void {
  const host = document.getElementById('notificationList');
  const bridge = window.MadStationNotifications;
  if (!(host instanceof HTMLElement) || !bridge) return;

  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => root.render(<NotificationsList model={model} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountNotifications, { once: true });
else mountNotifications();
