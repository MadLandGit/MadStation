import { createRoot, type Root } from 'react-dom/client';

export interface DownloadActionModel {
  action: string;
  label: string;
  className: string;
}

export interface DownloadRowModel {
  id: string;
  state: string;
  kind: string;
  name: string;
  meta: string;
  hasProgress: boolean;
  progress: number;
  indeterminate: boolean;
  actions: DownloadActionModel[];
}

export interface DownloadsListModel {
  items: DownloadRowModel[];
}

export interface DownloadsListBridge {
  attachReactRenderer(renderer: (model: DownloadsListModel) => void): void;
}

declare global {
  interface Window {
    MadStationDownloads?: DownloadsListBridge;
  }
}

function DownloadProgress({ item }: { item: DownloadRowModel }) {
  if (!item.hasProgress) return null;
  return (
    <div className={`dl-bar${item.indeterminate ? ' indeterminate' : ''}`}>
      <i
        data-pct={item.progress}
        ref={(element) => {
          // Keep the progress width as a programmatic DOM style update. The app CSP
          // disallows inline style attributes, so don't use React's style prop here.
          if (element) element.style.width = `${item.progress}%`;
        }}
      />
    </div>
  );
}

function DownloadsList({ model }: { model: DownloadsListModel }) {
  if (model.items.length === 0) {
    return (
      <div className="dl-empty">
        <strong>No downloads yet</strong>
        <span>Files you download from your accounts will appear here.</span>
      </div>
    );
  }

  return (
    <>
      {model.items.map((item) => (
        <div className="dl-row" data-state={item.state} data-kind={item.kind} key={item.id}>
          <span className="dl-ico">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 3h7l5 5v13H7z" />
              <path d="M14 3v5h5" />
            </svg>
          </span>
          <div className="dl-main">
            <div className="dl-name" title={item.name}>{item.name}</div>
            <div className="dl-meta">{item.meta}</div>
            <DownloadProgress item={item} />
          </div>
          <div className="dl-actions">
            {item.actions.map((action, index) => (
              <button
                className={action.className}
                type="button"
                data-dl-action={action.action}
                data-dl-id={item.id}
                key={`${action.action}-${index}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function mountDownloadsList(): void {
  const host = document.getElementById('downloadsList');
  const bridge = window.MadStationDownloads;
  if (!(host instanceof HTMLElement) || !bridge) return;

  const root: Root = createRoot(host);
  bridge.attachReactRenderer((model) => root.render(<DownloadsList model={model} />));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDownloadsList, { once: true });
else mountDownloadsList();
