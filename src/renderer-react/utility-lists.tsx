import { createRoot, type Root } from 'react-dom/client';
import { Fragment } from 'react';

export interface NoteListItem {
  id: string;
  title: string;
  body: string;
  updatedLabel: string;
}

export interface NotesListProps {
  items: NoteListItem[];
  emptyTitle: string;
  emptyDescription: string;
  onEdit(id: string): void;
  onDelete(id: string): void;
}

export interface TodoListItem {
  id: string;
  text: string;
  completed: boolean;
}

export type TodoFilter = 'all' | 'open' | 'done';

export interface TodoListProps {
  items: TodoListItem[];
  filter: TodoFilter;
  emptyTitle: string;
  emptyDescription: string;
  onToggle(id: string): void;
  onDelete(id: string): void;
}

export type ClipboardItemType = 'link' | 'code' | 'text';

export interface ClipboardListItem {
  id: string;
  text: string;
  type: ClipboardItemType;
  pinned: boolean;
  createdLabel: string;
  sizeLabel: string;
  lastCopiedLabel: string;
}

export interface ClipboardListProps {
  items: ClipboardListItem[];
  emptyTitle: string;
  emptyDescription: string;
  onCopy(id: string): void;
  onEdit(id: string): void;
  onTogglePin(id: string): void;
  onDelete(id: string): void;
}

export interface UtilityListsController {
  updateClipboard(props: ClipboardListProps): void;
  updateNotes(props: NotesListProps): void;
  updateTodos(props: TodoListProps): void;
}

declare global {
  interface Window {
    MadStationUtilityLists?: UtilityListsController;
  }
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="utility-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

function NoteBody({ body }: { body: string }) {
  return (
    <p>
      {body.split('\n').map((line, index) => (
        <Fragment key={`${index}-${line}`}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </p>
  );
}

function ClipboardPreview({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <Fragment key={`${index}-${line}`}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}

function ClipboardList(props: ClipboardListProps) {
  if (!props.items.length) {
    return (
      <div className="clipboard-empty">
        <div className="clipboard-empty-icon">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <rect height="16" rx="2" width="14" x="5" y="5" />
            <path d="M9 5V3h6v2" />
          </svg>
        </div>
        <strong>{props.emptyTitle}</strong>
        <span>{props.emptyDescription}</span>
      </div>
    );
  }

  return (
    <>
      {props.items.map((item) => {
        const typeLabel = item.type === 'link' ? 'LINK' : item.type === 'code' ? 'CODE' : 'TEXT';
        return (
          <article className={`clipboard-item${item.pinned ? ' is-pinned' : ''}`} data-clipboard-item={item.id} key={item.id}>
            <div className="clipboard-item-top">
              <div className="clipboard-item-meta">
                <span className={`clipboard-type-pill type-${item.type}`}>{typeLabel}</span>
                <span>SAVED</span>
                <span>·</span>
                <time>{item.createdLabel}</time>
              </div>
            </div>
            <button className="clipboard-snippet" type="button" title="Copy clip" onClick={() => props.onCopy(item.id)}>
              <ClipboardPreview text={item.text} />
            </button>
            <div className="clipboard-item-bottom">
              <span className="clipboard-size">{item.sizeLabel}{item.lastCopiedLabel ? ` · copied ${item.lastCopiedLabel}` : ''}</span>
              <div className="clipboard-item-actions">
                <button className="tiny-btn" type="button" onClick={() => props.onEdit(item.id)}>Edit</button>
                <button
                  className={`tiny-btn clipboard-pin${item.pinned ? ' active' : ''}`}
                  type="button"
                  title={item.pinned ? 'Unpin' : 'Pin'}
                  aria-label={`${item.pinned ? 'Unpin' : 'Pin'} clip`}
                  onClick={() => props.onTogglePin(item.id)}
                >
                  {item.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button className="tiny-btn clipboard-delete" type="button" title="Delete clip" aria-label="Delete clip" onClick={() => props.onDelete(item.id)}>
                  Delete
                </button>
                <button className="primary" type="button" onClick={() => props.onCopy(item.id)}>Copy</button>
              </div>
            </div>
          </article>
        );
      })}
    </>
  );
}

function NotesList(props: NotesListProps) {
  if (!props.items.length) {
    return <EmptyState title={props.emptyTitle} description={props.emptyDescription} />;
  }

  return (
    <>
      {props.items.map((note) => (
        <article className="note-card" data-note-id={note.id} key={note.id}>
          <div className="note-card-head">
            <div>
              <span className="eyebrow">NOTE</span>
              <h4>{note.title}</h4>
            </div>
            <div className="note-actions">
              <button className="tiny-btn" type="button" onClick={() => props.onEdit(note.id)}>
                Edit
              </button>
              <button
                className="icon-only note-delete"
                type="button"
                title="Delete note"
                aria-label={`Delete note ${note.title}`}
                onClick={() => props.onDelete(note.id)}
              >
                ×
              </button>
            </div>
          </div>
          <NoteBody body={note.body} />
          <time>Updated {note.updatedLabel}</time>
        </article>
      ))}
    </>
  );
}

function TodoList(props: TodoListProps) {
  if (!props.items.length) {
    return <EmptyState title={props.emptyTitle} description={props.emptyDescription} />;
  }

  return (
    <>
      {props.items.map((todo) => (
        <article className={`todo-row${todo.completed ? ' is-done' : ''}`} data-todo-id={todo.id} key={todo.id}>
          <label>
            <input
              type="checkbox"
              checked={todo.completed}
              aria-label={`${todo.completed ? 'Reopen' : 'Complete'} task: ${todo.text}`}
              onChange={() => props.onToggle(todo.id)}
            />
            <span>{todo.text}</span>
          </label>
          <button
            className="icon-only note-delete"
            type="button"
            title="Delete task"
            aria-label={`Delete task: ${todo.text}`}
            onClick={() => props.onDelete(todo.id)}
          >
            ×
          </button>
        </article>
      ))}
    </>
  );
}

const clipboardMount = document.getElementById('clipboardItems');
const notesMount = document.getElementById('notesList');
const todosMount = document.getElementById('todoList');
const clipboardRoot: Root | null = clipboardMount ? createRoot(clipboardMount) : null;
const notesRoot: Root | null = notesMount ? createRoot(notesMount) : null;
const todosRoot: Root | null = todosMount ? createRoot(todosMount) : null;

window.MadStationUtilityLists = {
  updateClipboard(props) {
    clipboardRoot?.render(<ClipboardList {...props} />);
  },
  updateNotes(props) {
    notesRoot?.render(<NotesList {...props} />);
  },
  updateTodos(props) {
    todosRoot?.render(<TodoList {...props} />);
  },
};

// Renderer controllers receive a handoff event and thereafter update React props
// instead of writing HTML into any React-owned utility-list subtree.
window.dispatchEvent(new Event('madstation:utility-lists-react-ready'));
