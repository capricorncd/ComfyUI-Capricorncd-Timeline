export class TimelineHistory {
    constructor({ capture, restore, onChange }) {
        this._capture = capture;
        this._restore = restore;
        this._onChange = onChange;
        this._undo = [];
        this._redo = [];
        this._pending = null;
        this._restoring = false;
    }

    get canUndo() { return this._undo.length > 0; }
    get canRedo() { return this._redo.length > 0; }

    clear() {
        this._undo = [];
        this._redo = [];
        this._pending = null;
        this._onChange();
    }

    _push(snapshot) {
        this._undo.push(snapshot);
        if (this._undo.length > 100) this._undo.shift();
        this._redo = [];
        this._onChange();
    }

    record() {
        if (this._restoring) return;
        this._push(this._capture());
    }

    // A drag captures once and commits only if it changed the project.
    begin() {
        if (this._restoring) return;
        this._pending = this._capture();
    }

    commit(changed) {
        const snapshot = this._pending;
        this._pending = null;
        if (!snapshot || !changed || this._restoring) return;
        this._push(snapshot);
    }

    cancel() {
        this._pending = null;
    }

    async undo() {
        if (!this.canUndo || this._restoring) return;
        const current = this._capture();
        const previous = this._undo.pop();
        this._redo.push(current);
        this._restoring = true;
        try {
            await this._restore(previous);
        } finally {
            this._restoring = false;
            this._onChange();
        }
    }

    async redo() {
        if (!this.canRedo || this._restoring) return;
        const current = this._capture();
        const next = this._redo.pop();
        this._undo.push(current);
        this._restoring = true;
        try {
            await this._restore(next);
        } finally {
            this._restoring = false;
            this._onChange();
        }
    }
}
