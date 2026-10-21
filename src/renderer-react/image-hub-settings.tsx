import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useState } from 'react';

export interface ImageHubSettingsModel {
  visible: boolean;
  favoritesFirst: boolean;
  accountView: 'list' | 'grid';
  confirmRemove: boolean;
}

type ImageHubSettingsAction =
  | { type: 'save'; settings: Pick<ImageHubSettingsModel, 'favoritesFirst' | 'accountView' | 'confirmRemove'> }
  | { type: 'close' };

const DEFAULT_MODEL: ImageHubSettingsModel = {
  visible: false,
  favoritesFirst: true,
  accountView: 'list',
  confirmRemove: true,
};

function dispatch(action: ImageHubSettingsAction): void {
  window.dispatchEvent(new CustomEvent<ImageHubSettingsAction>('madstation:image-hub-settings-action', { detail: action }));
}

function SettingsDialog() {
  const [model, setModel] = useState<ImageHubSettingsModel>(DEFAULT_MODEL);

  useEffect(() => {
    const onState = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object') return;
      const candidate = detail as Partial<ImageHubSettingsModel>;
      setModel({
        visible: candidate.visible === true,
        favoritesFirst: candidate.favoritesFirst !== false,
        accountView: candidate.accountView === 'grid' ? 'grid' : 'list',
        confirmRemove: candidate.confirmRemove !== false,
      });
    };
    window.addEventListener('madstation:image-hub-settings-state', onState);
    window.dispatchEvent(new Event('madstation:image-hub-settings-mounted'));
    return () => window.removeEventListener('madstation:image-hub-settings-state', onState);
  }, []);

  useEffect(() => {
    const overlay = document.getElementById('imageHubSettingsOverlay');
    if (!overlay) return;
    if (model.visible) {
      const closeButton = overlay.querySelector<HTMLButtonElement>('#imageHubSettingsClose');
      closeButton?.focus();
    }
    const onClick = (event: MouseEvent) => {
      if (event.target === overlay && model.visible) dispatch({ type: 'close' });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!model.visible) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dispatch({ type: 'close' });
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    overlay.addEventListener('click', onClick);
    overlay.addEventListener('keydown', onKeyDown);
    return () => {
      overlay.removeEventListener('click', onClick);
      overlay.removeEventListener('keydown', onKeyDown);
    };
  }, [model.visible]);

  return <section className="ms-card ms-card--flat clipboard-settings-card" aria-label="Image Hub preferences">
    <header className="clipboard-settings-heading">
      <button className="close ms-icon-btn" id="imageHubSettingsClose" type="button" aria-label="Back" title="Back" onClick={() => dispatch({ type: 'close' })}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <span className="clipboard-settings-icon ms-brand-tile" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
      <div><div className="modal-title" id="imageHubSettingsTitle">Image Hub settings</div><div className="modal-subtitle" id="imageHubSettingsSubtitle">Choose how your image workspace lists tools and handles removals.</div></div>
    </header>
    <div className="clipboard-settings-section">
      <div className="clipboard-settings-section-title ms-eyebrow">Workspace</div>
      <div className="clipboard-settings-section-subtitle ms-muted">These options affect Image Hub only.</div>
      <label className="toggle-row"><input type="checkbox" checked={model.favoritesFirst} onChange={(event) => setModel((current) => ({ ...current, favoritesFirst: event.currentTarget.checked }))}/><span><strong>Show favorites first</strong><small>Keep your starred image tools at the top of the list.</small></span></label>
      <label className="toggle-row"><input type="checkbox" checked={model.accountView === 'grid'} onChange={(event) => setModel((current) => ({ ...current, accountView: event.currentTarget.checked ? 'grid' : 'list' }))}/><span><strong>Use grid view for accounts</strong><small>Show accounts as compact tiles instead of a list.</small></span></label>
      <label className="toggle-row"><input type="checkbox" checked={model.confirmRemove} onChange={(event) => setModel((current) => ({ ...current, confirmRemove: event.currentTarget.checked }))}/><span><strong>Confirm before removing custom tools</strong><small>Ask before deleting tools you added yourself.</small></span></label>
    </div>
    <footer className="clipboard-settings-actions"><button className="ms-btn" type="button" onClick={() => dispatch({ type: 'close' })}>Cancel</button><button className="ms-btn ms-btn--primary" type="button" onClick={() => dispatch({ type: 'save', settings: { favoritesFirst: model.favoritesFirst, accountView: model.accountView, confirmRemove: model.confirmRemove } })}>Save settings</button></footer>
  </section>;
}

function mountImageHubSettings(): void {
  const host = document.getElementById('imageHubSettingsReactMount');
  if (!(host instanceof HTMLElement)) return;
  const root: Root = createRoot(host);
  root.render(<SettingsDialog />);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountImageHubSettings, { once: true });
else mountImageHubSettings();
