import { createRoot, type Root } from 'react-dom/client';

export interface MemoryProcessRow {
  name: string;
  type: string;
  pid: number;
  ram: string;
}

export interface MemoryProcessTableModel {
  summary: Array<{ label: string; value: string }>;
  processes: MemoryProcessRow[];
}

export interface MemoryProcessTableBridge {
  attachReactRenderer(renderer: (model: MemoryProcessTableModel) => void): void;
}

declare global {
  interface Window {
    MadStationMemoryProcessTable?: MemoryProcessTableBridge;
  }
}

function MemoryProcessSummary({ model }: { model: MemoryProcessTableModel }) {
  return (
    <>
      {model.summary.map((item) => (
        <div className="memory-process-summary-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </>
  );
}

function MemoryProcessRows({ processes }: { processes: MemoryProcessRow[] }) {
  if (!processes.length) {
    return <tr><td colSpan={4} className="memory-process-empty">Process metrics unavailable.</td></tr>;
  }
  return (
    <>
      {processes.map((process, index) => (
        <tr key={`${process.pid || 'unknown'}-${process.name}-${index}`}>
          <td><strong>{process.name}</strong></td>
          <td>{process.type}</td>
          <td>{process.pid || '—'}</td>
          <td><strong>{process.ram}</strong></td>
        </tr>
      ))}
    </>
  );
}

function mountMemoryProcessTable(): void {
  const summaryHost = document.getElementById('memoryProcessSummary');
  const bodyHost = document.getElementById('memoryProcessesBody');
  const bridge = window.MadStationMemoryProcessTable;
  if (!(summaryHost instanceof HTMLElement) || !(bodyHost instanceof HTMLElement) || !bridge) return;
  const summaryRoot: Root = createRoot(summaryHost);
  const bodyRoot: Root = createRoot(bodyHost);
  bridge.attachReactRenderer((model) => {
    summaryRoot.render(<MemoryProcessSummary model={model} />);
    bodyRoot.render(<MemoryProcessRows processes={model.processes} />);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMemoryProcessTable, { once: true });
else mountMemoryProcessTable();
