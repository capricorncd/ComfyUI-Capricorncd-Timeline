export class FontCatalog {
    constructor(loadFonts, onLoaded) {
        this._loadFonts = loadFonts;
        this._onLoaded = onLoaded;
        this.fonts = [];
        this._pending = null;
    }

    load() {
        if (!this._pending) {
            this._pending = this._loadFonts().then(
                fonts => {
                    this.fonts = fonts;
                    this._onLoaded(true);
                    return this.fonts;
                },
                () => {
                    this.fonts = [];
                    this._onLoaded(false);
                    return this.fonts;
                },
            );
        }
        return this._pending;
    }
}
