import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {ProcStat} from './engine/ProcStat.js';
import {NetDev} from './engine/NetDev.js';
import {DiskStat} from './engine/DiskStat.js';
import {ProcessTracker} from './engine/ProcessTracker.js';
import {SocketTracker} from './engine/SocketTracker.js';
import {ClockDial} from './dials/ClockDial.js';
import {CpuDial} from './dials/CpuDial.js';
import {MetricDial} from './dials/MetricDial.js';
import {ProcessTray} from './dials/ProcessTray.js';
import {SocketTray} from './dials/SocketTray.js';
import {TopBarPill} from './dials/TopBarPill.js';
import {DockLayout} from './dock/DockLayout.js';
import {EditSession} from './dock/EditSession.js';
import {MetricLoop} from './metrics/MetricLoop.js';

export class PrimeOverlayApp {
    constructor(extension) {
        this._ext = extension;
        this._settings = extension.getSettings();
        this._settingsSignals = [];
        this._editKeybindingAdded = false;
        this._toggleKeybindingAdded = false;
        this._topBarPill = null;
    }

    enable() {
        const theme = this._settings.get_string('theme');
        const scale = this._settings.get_double('scale-factor');
        const enableInterp = this._settings.get_boolean('enable-interpolation');

        this._clock = new ClockDial({theme, scale});
        this._cpu = new CpuDial({theme, scale, enableInterpolation: enableInterp});
        this._memDiskRow = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'prime-row-2col',
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
        });
        this._mem = new MetricDial({
            type: 'memory',
            title: 'RAM',
            theme,
            scale,
            compact: true,
            enableInterpolation: enableInterp,
        });
        this._disk = new MetricDial({
            type: 'disk',
            title: 'DISK',
            theme,
            scale,
            compact: true,
            enableInterpolation: enableInterp,
        });
        this._memDiskRow.add_child(this._mem);
        this._memDiskRow.add_child(this._disk);
        this._net = new MetricDial({
            type: 'network',
            title: 'NETWORK',
            theme,
            scale,
            compact: false,
            enableInterpolation: enableInterp,
        });
        this._procsTray = new ProcessTray({
            tracker: new ProcessTracker(),
            onToggle: () => this._dock.applyRelayout(),
        });
        this._socketsTray = new SocketTray({
            tracker: new SocketTracker(),
            onToggle: () => this._dock.applyRelayout(),
        });

        const cardMap = new Map([
            ['clock', this._clock],
            ['cpu', this._cpu],
            ['memory_storage', this._memDiskRow],
            ['network', this._net],
            ['processes', this._procsTray],
            ['connections', this._socketsTray],
        ]);

        this._dock = new DockLayout({
            settings: this._settings,
            cardMap,
            mem: this._mem,
            disk: this._disk,
            procsTray: this._procsTray,
            socketsTray: this._socketsTray,
        });
        this._edit = new EditSession({
            settings: this._settings,
            dock: this._dock,
            editable: [this._clock, this._cpu, this._mem, this._disk, this._net, this._procsTray, this._socketsTray],
            mem: this._mem,
            disk: this._disk,
        });
        this._loop = new MetricLoop({
            settings: this._settings,
            proc: new ProcStat(),
            net: new NetDev(),
            disk: new DiskStat(),
            clock: this._clock,
            cpu: this._cpu,
            mem: this._mem,
            diskDial: this._disk,
            netDial: this._net,
            dock: this._dock,
        });

        this._clock.setClockStyle(this._settings.get_string('clock-style'));
        this._cpu.setTempUnit(this._settings.get_string('temp-unit'));
        this._dock.setRelayoutListener(() => this._edit.reposition());
        this._dock.enable();
        this._bindKeybindings();
        this._connectSettings();
        this._setupTopBarPill();
        this._loop.start();
    }

    disable() {
        this._loop.stop();
        this._unbindKeybindings();
        for (const id of this._settingsSignals)
            this._settings.disconnect(id);
        this._settingsSignals = [];
        this._edit.destroy();
        if (this._topBarPill) {
            this._topBarPill.destroy();
            this._topBarPill = null;
        }
        this._loop.setPill(null);
        this._dock.destroy();
        this._loop = null;
        this._edit = null;
        this._dock = null;
        this._settings = null;
    }

    openPreferences() {
        this._ext.openPreferences();
    }

    toggleEditDockMode(force) {
        this._edit.toggle(force);
    }

    _bindKeybindings() {
        this._unbindKeybindings();
        const editBinding = this._settings.get_strv('dock-edit-hotkey');
        if (editBinding.length > 0) {
            Main.wm.addKeybinding(
                'dock-edit-hotkey',
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._edit.toggle()
            );
            this._editKeybindingAdded = true;
        }
        const toggleBinding = this._settings.get_strv('overlay-hotkey');
        if (toggleBinding.length > 0) {
            Main.wm.addKeybinding(
                'overlay-hotkey',
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._dock.toggleVisibility()
            );
            this._toggleKeybindingAdded = true;
        }
    }

    _unbindKeybindings() {
        if (this._editKeybindingAdded) {
            Main.wm.removeKeybinding('dock-edit-hotkey');
            this._editKeybindingAdded = false;
        }
        if (this._toggleKeybindingAdded) {
            Main.wm.removeKeybinding('overlay-hotkey');
            this._toggleKeybindingAdded = false;
        }
    }

    _connectSettings() {
        const keys = [
            'monitor-index',
            'dock-position',
            'dock-length-mode',
            'dock-alignment',
            'dock-thickness',
            'dock-margin',
            'dock-corner-radius',
            'dock-opacity',
            'dock-affects-struts',
            'dock-modules',
            'theme',
            'scale-factor',
            'card-opacity',
            'clock-style',
            'temp-unit',
            'show-clock',
            'show-cpu',
            'show-memory',
            'show-disk',
            'show-network',
            'show-processes',
            'show-connections',
            'topbar-show-pill',
            'enable-interpolation',
            'show-in-overview',
            'overlay-hotkey',
            'dock-edit-hotkey',
            'update-interval',
        ];
        for (const key of keys) {
            const id = this._settings.connect(`changed::${key}`, () => {
                this._onSettingChanged(key);
            });
            this._settingsSignals.push(id);
        }
    }

    _onSettingChanged(key) {
        if (key === 'theme') {
            const theme = this._settings.get_string('theme');
            this._clock.setTheme(theme);
            this._cpu.setTheme(theme);
            this._mem.setTheme(theme);
            this._disk.setTheme(theme);
            this._net.setTheme(theme);
        } else if (key === 'scale-factor') {
            const scale = this._settings.get_double('scale-factor');
            this._clock.setScale(scale);
            this._cpu.setScale(scale);
            this._mem.setScale(scale);
            this._disk.setScale(scale);
            this._net.setScale(scale);
            this._dock.applyRelayout();
        } else if (key === 'card-opacity' || key === 'dock-opacity' || key === 'dock-corner-radius') {
            this._dock.applyCardOpacity();
            this._dock.applyRelayout();
        } else if (key === 'clock-style') {
            this._clock.setClockStyle(this._settings.get_string('clock-style'));
        } else if (key === 'temp-unit') {
            this._cpu.setTempUnit(this._settings.get_string('temp-unit'));
        } else if (key === 'enable-interpolation') {
            const enabled = this._settings.get_boolean('enable-interpolation');
            this._cpu.setInterpolation(enabled);
            this._mem.setInterpolation(enabled);
            this._disk.setInterpolation(enabled);
            this._net.setInterpolation(enabled);
        } else if (key === 'dock-modules') {
            this._dock.applyCardPlacement();
        } else if (key === 'dock-affects-struts' || key === 'monitor-index') {
            this._dock.attach();
        } else if (key === 'dock-length-mode') {
            this._dock.attach();
        } else if (key === 'topbar-show-pill') {
            this._setupTopBarPill();
        } else if (key === 'overlay-hotkey' || key === 'dock-edit-hotkey') {
            this._bindKeybindings();
        } else if (key === 'update-interval') {
            this._loop.start();
        } else if (key === 'show-in-overview') {
            this._dock.applyOverviewSetting();
        } else if (key.startsWith('show-')) {
            this._dock.applyModuleVisibility();
            this._dock.applyRelayout();
        } else if (key.includes('dock-')) {
            this._dock.applyRelayout();
        }
    }

    _setupTopBarPill() {
        const showPill = this._settings.get_boolean('topbar-show-pill');
        if (showPill) {
            if (!this._topBarPill) {
                this._topBarPill = new TopBarPill(this, this._settings);
                Main.panel.addToStatusArea('prime-overlay-pill', this._topBarPill, 1, 'right');
                this._loop.setPill(this._topBarPill);
            }
        } else if (this._topBarPill) {
            this._topBarPill.destroy();
            this._topBarPill = null;
            this._loop.setPill(null);
        }
    }
}
