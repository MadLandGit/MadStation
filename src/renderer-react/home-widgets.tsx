import { createRoot } from 'react-dom/client';
import { useLayoutEffect, useRef, useState } from 'react';
export type HomeWidgetSize = 'small' | 'medium' | 'large';

export interface HomeWidgetViewItem {
  id: string;
  title: string;
  size: HomeWidgetSize;
  order: number | null;
}

export interface HomeWidgetViewModel {
  revision: number;
  widgets: HomeWidgetViewItem[];
}

export interface HomeWidgetController {
  attachReactRenderer(renderer: (model: HomeWidgetViewModel) => void): void;
  mountPanel(id: string, panel: HTMLElement): void;
}

declare global {
  interface Window {
    MadHomeWidgets?: HomeWidgetController;
    MadHomeCore?: { refresh(): void };
  }
}

const initialModel: HomeWidgetViewModel = { revision: 0, widgets: [] };

function WidgetShell({ widget, controller }: { widget: HomeWidgetViewItem; controller: HomeWidgetController }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    try {
      controller.mountPanel(widget.id, panel);
    } catch (caught) {
      panel.replaceChildren();
      console.error(`Home widget "${widget.id}" failed to render`, caught);
      setError(true);
    }
  }, [controller, widget.id]);

  return (
    <section className="home-widget" data-widget-id={widget.id} data-size={widget.size} aria-label={widget.title}>
      <header className="home-widget-heading">
        <h2 className="home-widget-title">{widget.title}</h2>
      </header>
      <div className="home-widget-content" data-widget-panel={widget.id} ref={panelRef} />
      {error ? <p className="home-widget-error" role="alert">This widget could not be loaded.</p> : null}
    </section>
  );
}

function HomeWidgetsRoot() {
  const [model, setModel] = useState<HomeWidgetViewModel>(initialModel);
  const controller = window.MadHomeWidgets;

  useLayoutEffect(() => {
    if (!controller) return;
    controller.attachReactRenderer(setModel);
  }, [controller]);

  useLayoutEffect(() => {
    // Queue the notification until all child layout effects have mounted their
    // widget panels, so the legacy telemetry adapter sees real mount IDs.
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      document.dispatchEvent(new CustomEvent('mad:home-widgets-built'));
      window.MadHomeCore?.refresh();
    });
    return () => { active = false; };
  }, [model.revision]);

  if (!controller) return null;
  return (
    <>
      {model.widgets.map((widget) => (
        <WidgetShell key={widget.id} widget={widget} controller={controller} />
      ))}
    </>
  );
}

const mount = document.getElementById('homeWidgets');
if (mount) createRoot(mount).render(<HomeWidgetsRoot />);
