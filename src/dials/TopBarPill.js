import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export const TopBarPill = GObject.registerClass({
    GTypeName: 'PrimeTopBarPill',
}, class TopBarPill extends PanelMenu.Button {
    _init(app, settings) {
        super._init(0.0, _('Prime Overlay'));

        this._app = app;
        this._settings = settings;
        this._settingsSignals = [];

        this._box = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'prime-topbar-box',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._dot = new St.Widget({
            style_class: 'prime-topbar-dot',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._dot);

        this._cpuLabel = new St.Label({
            text: 'CPU --%',
            style_class: 'prime-topbar-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._cpuLabel);

        this._memLabel = new St.Label({
            text: 'RAM --%',
            style_class: 'prime-topbar-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._memLabel);

        this._tempLabel = new St.Label({
            text: '--°C',
            style_class: 'prime-topbar-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._tempLabel);

        this._netLabel = new St.Label({
            text: '--',
            style_class: 'prime-topbar-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._netLabel);

        this.add_child(this._box);

        this._buildMenu();
        this._syncMetricVisibility();

        const keys = ['topbar-metrics', 'topbar-alert-threshold', 'theme'];
        for (const key of keys) {
            const id = this._settings.connect(`changed::${key}`, () => {
                this._syncMetricVisibility();
            });
            this._settingsSignals.push(id);
        }
    }

    _buildMenu() {
        this.menu.removeAll();

        const MENU_WIDTH = 310;
        this.menu.box.add_style_class_name('prime-menu-box');
        this.menu.box.set_style(`width: ${MENU_WIDTH}px; min-width: ${MENU_WIDTH}px; max-width: ${MENU_WIDTH}px;`);
        this.menu.actor.add_style_class_name('prime-menu-popup');
        this.menu.actor.set_style(`width: ${MENU_WIDTH}px; min-width: ${MENU_WIDTH}px; max-width: ${MENU_WIDTH}px;`);

        const titleItem = new PopupMenu.PopupMenuItem(_('Prime Dock Telemetry'), {
            reactive: false,
            style_class: 'prime-menu-title',
        });
        titleItem.label.x_expand = true;
        titleItem.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this.menu.addMenuItem(titleItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const createTelemetryRow = (category) => {
            const item = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                style_class: 'prime-menu-telemetry-item',
            });
            const catLabel = new St.Label({
                text: category,
                style_class: 'prime-menu-cat-label',
                y_align: Clutter.ActorAlign.CENTER,
            });
            catLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

            const valLabel = new St.Label({
                text: _('Initializing...'),
                style_class: 'prime-menu-val-label',
                x_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.CENTER,
            });
            valLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            valLabel.clutter_text.line_wrap = false;

            item.add_child(catLabel);
            item.add_child(valLabel);
            this.menu.addMenuItem(item);
            return valLabel;
        };

        this._menuCpuVal = createTelemetryRow(_('CPU'));
        this._menuMemVal = createTelemetryRow(_('Memory'));
        this._menuDiskVal = createTelemetryRow(_('Storage'));
        this._menuNetVal = createTelemetryRow(_('Network'));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const editDockItem = new PopupMenu.PopupMenuItem(_('Customize Dock'));
        editDockItem.label.x_expand = true;
        editDockItem.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        editDockItem.connect('activate', () => {
            if (this._app)
                this._app.toggleEditDockMode(true);
        });
        this.menu.addMenuItem(editDockItem);

        const prefsItem = new PopupMenu.PopupMenuItem(_('Dock Preferences'));
        prefsItem.label.x_expand = true;
        prefsItem.label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        prefsItem.connect('activate', () => {
            if (this._app)
                this._app.openPreferences();
        });
        this.menu.addMenuItem(prefsItem);
    }

    _syncMetricVisibility() {
        const metrics = this._settings.get_strv('topbar-metrics');
        const showCpu = metrics.includes('cpu');
        const showMem = metrics.includes('ram');
        const showTemp = metrics.includes('temp');
        const showNet = metrics.includes('net');

        this._cpuLabel.visible = showCpu;
        this._memLabel.visible = showMem;
        this._tempLabel.visible = showTemp;
        this._netLabel.visible = showNet;
    }

    updateMetrics(cpuData, memData, netData, diskData) {
        const threshold = this._settings.get_int('topbar-alert-threshold');
        let hasAlert = false;

        if (cpuData) {
            const cpuTotal = Math.round(cpuData.totalUsage ?? cpuData.totalPercent ?? 0);
            this._cpuLabel.set_text(`CPU ${cpuTotal}%`);
            this._tempLabel.set_text(`${cpuData.temperatureC !== null && cpuData.temperatureC !== undefined ? cpuData.temperatureC : '--'}°C`);
            if (this._menuCpuVal) {
                const freq = cpuData.frequencyMHz ?? '--';
            const temp = cpuData.temperatureC ?? '--';
            this._menuCpuVal.set_text(`${cpuTotal}%  |  ${freq} MHz  |  ${temp}°C`);
            }

            if (cpuTotal >= threshold) {
                hasAlert = true;
            }
        }

        if (memData) {
            const memPct = Math.round(memData.percent || 0);
            this._memLabel.set_text(`RAM ${memPct}%`);
            if (this._menuMemVal) {
                this._menuMemVal.set_text(`${memData.usedGB} / ${memData.totalGB} GB (${memPct}%)`);
            }

            if (memPct >= threshold) {
                hasAlert = true;
            }
        }

        if (diskData && diskData.root && this._menuDiskVal) {
            this._menuDiskVal.set_text(`${diskData.root.usedGB} / ${diskData.root.totalGB} GB (${diskData.root.usedPercent}%)`);
        }

        if (netData) {
            this._netLabel.set_text(`${netData.downFormatted}  ${netData.upFormatted}`);
            if (this._menuNetVal)
                this._menuNetVal.set_text(`${netData.downFormatted}  ${netData.upFormatted}`);
        }

        if (hasAlert) {
            this._dot.set_style('background-color: #ff5252; box-shadow: 0 0 6px rgba(255, 82, 82, 0.8);');
            this._box.add_style_class_name('prime-topbar-alert');
        } else {
            this._dot.set_style('');
            this._box.remove_style_class_name('prime-topbar-alert');
        }
    }

    destroy() {
        for (const id of this._settingsSignals) {
            this._settings.disconnect(id);
        }
        this._settingsSignals = [];
        this._app = null;
        super.destroy();
    }
});
