import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {PrimeOverlayApp} from './src/app.js';

export default class PrimeOverlayExtension extends Extension {
    enable() {
        this._app = new PrimeOverlayApp(this);
        this._app.enable();
    }

    disable() {
        this._app.disable();
        this._app = null;
    }
}
