import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MeridianDockApp} from './src/app.js';

export default class MeridianDockExtension extends Extension {
    enable() {
        this._app = new MeridianDockApp(this);
        this._app.enable();
    }

    disable() {
        this._app.disable();
        this._app = null;
    }
}
