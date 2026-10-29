import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {addDockPage} from './prefs/dock.js';
import {addAppearancePage} from './prefs/appearance.js';
import {addTopBarPage} from './prefs/topBar.js';
import {addModulesPage} from './prefs/modules.js';

export default class MeridianDockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(700, 720);
        window.set_size_request(580, 500);
        addDockPage(window, settings);
        addAppearancePage(window, settings);
        addTopBarPage(window, settings);
        addModulesPage(window, settings);
    }
}
