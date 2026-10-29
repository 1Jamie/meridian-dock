import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ProcessTracker} from '../engine/ProcessTracker.js';
import {armTimeout} from './trayTimer.js';

export const ProcessTray = GObject.registerClass({
    GTypeName: 'PrimeProcessTray',
}, class ProcessTray extends St.BoxLayout {
    _init(params = {}) {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'prime-card prime-tray-card',
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
        });

        this._tracker = params.tracker || new ProcessTracker();
        this._onToggle = params.onToggle;
        this._isExpanded = false;
        this._timerId = null;
        this._idleId = null;
        this._sortBy = 'cpu';
        this._isEditMode = false;
        this._isHorizontal = false;
        this._updating = false;
        this._needsUpdate = false;
        this._pinned = new Set();

        this._headerButton = new St.Button({
            style_class: 'prime-tray-header-button',
            can_focus: true,
            reactive: true,
            x_expand: true,
        });

        const headerBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        this._arrowIcon = new St.Icon({
            icon_name: 'pan-end-symbolic',
            icon_size: 12,
            style_class: 'prime-tray-arrow',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._titleLabel = new St.Label({
            text: _('Top Processes'),
            style_class: 'prime-card-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        this._sortBtn = new St.Button({
            style_class: 'prime-tray-chip',
            can_focus: true,
            reactive: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const sortBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._sortLabel = new St.Label({
            text: _('CPU'),
            style_class: 'prime-tray-chip-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        sortBox.add_child(this._sortLabel);
        sortBox.add_child(new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 10,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._sortBtn.set_child(sortBox);
        this._sortBtn.connect('button-press-event', (actor, event) => {
            if (this._isEditMode)
                return Clutter.EVENT_PROPAGATE;
            this._toggleSort();
            return Clutter.EVENT_STOP;
        });

        this._summaryPin = new St.Icon({
            icon_name: 'view-pin-symbolic',
            icon_size: 12,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        this._summaryLabel = new St.Label({
            text: '',
            style_class: 'prime-tray-summary',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        headerBox.add_child(this._arrowIcon);
        headerBox.add_child(this._titleLabel);
        headerBox.add_child(this._sortBtn);
        headerBox.add_child(this._summaryPin);
        headerBox.add_child(this._summaryLabel);
        this._headerButton.set_child(headerBox);

        this._headerButton.connect('clicked', () => {
            if (this._isEditMode)
                return;
            this.toggle();
        });
        this._headerButton.connect('button-press-event', (actor, event) => {
            if (this._isEditMode)
                return Clutter.EVENT_PROPAGATE;
            if (event.get_button() === 3) {
                this._toggleSort();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.add_child(this._headerButton);

        this._contentBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'prime-tray-content',
            visible: false,
            x_expand: true,
        });

        this._rows = [];
        for (let i = 0; i < 5; i++) {
            const row = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                style_class: 'prime-process-row',
                reactive: true,
                track_hover: true,
                can_focus: true,
                x_expand: true,
            });
            const topBox = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            const pinIcon = new St.Icon({
                icon_name: 'view-pin-symbolic',
                icon_size: 10,
                style_class: 'prime-proc-pin-icon',
                y_align: Clutter.ActorAlign.CENTER,
                visible: false,
            });
            const nameLabel = new St.Label({
                text: '--',
                style_class: 'prime-proc-name',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const statLabel = new St.Label({
                text: '0%  0MB',
                style_class: 'prime-proc-stat',
                y_align: Clutter.ActorAlign.CENTER,
            });
            topBox.add_child(pinIcon);
            topBox.add_child(nameLabel);
            topBox.add_child(statLabel);
            row.add_child(topBox);

            const barArea = new St.DrawingArea({
                height: 3,
                style_class: 'prime-proc-bar',
                x_expand: true,
            });
            const rowState = {
                pid: 0,
                pids: [],
                name: '',
                ratio: 0.0,
                isHigh: false,
                isMemSort: false,
                isPinned: false,
            };
            barArea.connect('repaint', area => {
                const cr = area.get_context();
                const [w, h] = area.get_surface_size();
                if (w <= 0 || h <= 0) {
                    cr.$dispose();
                    return;
                }
                cr.setSourceRGBA(1.0, 1.0, 1.0, 0.08);
                cr.rectangle(0, 0, w, h);
                cr.fill();
                if (rowState.ratio > 0.01) {
                    if (rowState.isHigh)
                        cr.setSourceRGBA(1.0, 0.36, 0.44, 0.95);
                    else if (rowState.isMemSort)
                        cr.setSourceRGBA(0.40, 0.70, 1.0, 0.90);
                    else
                        cr.setSourceRGBA(0.0, 0.898, 1.0, 0.90);
                    cr.rectangle(0, 0, Math.min(w, Math.max(3, w * rowState.ratio)), h);
                    cr.fill();
                }
                cr.$dispose();
            });
            row.add_child(barArea);
            row.connect('button-press-event', (actor, event) => {
                if (this._isEditMode)
                    return Clutter.EVENT_PROPAGATE;
                const button = event.get_button();
                if (!rowState.pid)
                    return Clutter.EVENT_PROPAGATE;
                if (button === 1) {
                    this._inspectProcess(rowState.pid, rowState.pids);
                    return Clutter.EVENT_STOP;
                }
                if (button === 3 && rowState.name) {
                    this._togglePin(rowState.name);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            this._contentBox.add_child(row);
            this._rows.push({row, nameLabel, statLabel, barArea, pinIcon, rowState});
        }
        this.add_child(this._contentBox);
    }

    _togglePin(name) {
        if (!name)
            return;
        if (this._pinned.has(name))
            this._pinned.delete(name);
        else
            this._pinned.add(name);
        this._update();
    }

    _toggleSort() {
        this._sortBy = this._sortBy === 'cpu' ? 'mem' : 'cpu';
        this._sortLabel.set_text(this._sortBy === 'cpu' ? _('CPU') : _('RAM'));
        this._updating = false;
        this._update();
    }

    _inspectProcess(pid, pids = []) {
        const candidatePids = new Set(pids.length > 0 ? pids : [pid]);
        for (const actor of global.get_window_actors()) {
            const metaWin = actor.get_meta_window();
            if (metaWin && candidatePids.has(metaWin.get_pid())) {
                metaWin.activate(global.get_current_time());
                return;
            }
        }
        const app = Shell.AppSystem.get_default().lookup_app('org.gnome.SystemMonitor.desktop');
        if (app)
            app.activate();
    }

    toggle() {
        this.setExpanded(!this._isExpanded);
    }

    _armTimer(seconds) {
        this._timerId = armTimeout(this._timerId, seconds, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    setExpanded(expanded) {
        this._isExpanded = expanded;
        this._contentBox.visible = expanded;
        this._arrowIcon.icon_name = expanded ? 'pan-down-symbolic' : 'pan-end-symbolic';
        this.set_size(-1, -1);
        this.queue_relayout();
        const parent = this.get_parent();
        if (parent)
            parent.queue_relayout();
        this._onToggle(expanded);

        if (expanded) {
            this._update();
            this._armTimer(2);
        } else if (this._isHorizontal) {
            this._armTimer(3);
        } else {
            this._clearTimer();
        }
    }

    async _update() {
        if (!this._rows)
            return;
        if (this._updating) {
            this._needsUpdate = true;
            return;
        }

        this._updating = true;
        this._needsUpdate = false;
        const procs = await this._tracker.sampleTopProcessesAsync(50, this._sortBy);
        this._updating = false;

        if (this._needsUpdate) {
            this._needsUpdate = false;
            if (this._idleId) {
                GLib.Source.remove(this._idleId);
                this._idleId = null;
            }
            this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._idleId = null;
                this._update();
                return GLib.SOURCE_REMOVE;
            });
        }

        if (!this._rows)
            return;

        const topVal = procs.length > 0
            ? (this._sortBy === 'mem' ? procs[0].memMB : procs[0].cpu)
            : 0;
        const pinnedList = [];
        const unpinnedList = [];
        for (const proc of procs) {
            if (this._pinned.has(proc.name))
                pinnedList.push(proc);
            else
                unpinnedList.push(proc);
        }
        const displayProcs = [...pinnedList, ...unpinnedList].slice(0, this._rows.length);

        if (this._isHorizontal && displayProcs.length > 0) {
            const top = displayProcs[0];
            const value = this._sortBy === 'mem'
                ? (top.memMB >= 1024 ? `${(top.memMB / 1024).toFixed(1)}GB` : `${top.memMB}MB`)
                : `${top.cpu}%`;
            const name = top.count > 1 ? `${top.name} (${top.count})` : top.name;
            this._summaryPin.visible = this._pinned.has(top.name);
            this._summaryLabel.set_text(`${name.substring(0, 14)} ${value}`);
            this._summaryLabel.visible = true;
        }

        if (!this._isExpanded)
            return;

        for (let i = 0; i < this._rows.length; i++) {
            const item = this._rows[i];
            if (i < displayProcs.length) {
                const proc = displayProcs[i];
                const isPinned = this._pinned.has(proc.name);
                item.rowState.pid = proc.pid;
                item.rowState.pids = proc.pids || [proc.pid];
                item.rowState.name = proc.name;
                item.rowState.isPinned = isPinned;
                item.rowState.isMemSort = this._sortBy === 'mem';
                const curVal = this._sortBy === 'mem' ? proc.memMB : proc.cpu;
                item.rowState.ratio = topVal > 0 ? Math.min(1.0, curVal / topVal) : 0;
                item.rowState.isHigh = this._sortBy === 'mem' ? proc.memMB > 4096 : proc.cpu > 70;
                const memStr = proc.memMB >= 1024 ? `${(proc.memMB / 1024).toFixed(1)}GB` : `${proc.memMB}MB`;
                const nameDisplay = proc.count > 1 ? `${proc.name} (${proc.count})` : proc.name;
                item.nameLabel.set_text(nameDisplay.substring(0, isPinned ? 15 : 18));
                item.statLabel.set_text(`${proc.cpu}%  ${memStr}`);
                item.pinIcon.visible = isPinned;
                if (isPinned)
                    item.row.add_style_class_name('prime-process-row-pinned');
                else
                    item.row.remove_style_class_name('prime-process-row-pinned');
                item.barArea.queue_repaint();
                item.row.visible = true;
            } else {
                item.rowState.pid = 0;
                item.rowState.pids = [];
                item.rowState.name = '';
                item.rowState.isPinned = false;
                item.pinIcon.visible = false;
                item.row.remove_style_class_name('prime-process-row-pinned');
                item.row.visible = false;
            }
        }
    }

    setHorizontal(isHorizontal) {
        this._isHorizontal = !!isHorizontal;
        if (this._isHorizontal) {
            this.add_style_class_name('prime-tray-horizontal');
            this._summaryLabel.visible = true;
            this._update();
            this._armTimer(this._isExpanded ? 2 : 3);
        } else {
            this.remove_style_class_name('prime-tray-horizontal');
            this._summaryLabel.visible = false;
            this._summaryPin.visible = false;
            if (!this._isExpanded)
                this._clearTimer();
        }
    }

    setEditMode(enabled) {
        this._isEditMode = !!enabled;
        this._headerButton.reactive = !enabled;
        this._headerButton.can_focus = !enabled;
        this._sortBtn.reactive = !enabled;
        this._sortBtn.can_focus = !enabled;
    }

    _clearTimer() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = null;
        }
    }

    stop() {
        this._clearTimer();
    }

    destroy() {
        this._clearTimer();
        if (this._idleId) {
            GLib.Source.remove(this._idleId);
            this._idleId = null;
        }
        this._rows = null;
        super.destroy();
    }
});
