import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {SocketTracker} from '../engine/SocketTracker.js';
import {armTimeout} from './trayTimer.js';

export const SocketTray = GObject.registerClass({
    GTypeName: 'PrimeSocketTray',
}, class SocketTray extends St.BoxLayout {
    _init(params = {}) {
        super._init({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'prime-card prime-tray-card',
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
        });

        this._tracker = params.tracker || new SocketTracker();
        this._onToggle = params.onToggle;
        this._isExpanded = false;
        this._timerId = null;
        this._mode = 'estab';
        this._isEditMode = false;
        this._isHorizontal = false;
        this._updating = false;

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
            text: _('Connections'),
            style_class: 'prime-card-header',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

        this._modeBtn = new St.Button({
            style_class: 'prime-tray-chip',
            can_focus: true,
            reactive: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const modeBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._modeLabel = new St.Label({
            text: _('Out'),
            style_class: 'prime-tray-chip-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        modeBox.add_child(this._modeLabel);
        modeBox.add_child(new St.Icon({
            icon_name: 'pan-down-symbolic',
            icon_size: 10,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        this._modeBtn.set_child(modeBox);
        this._modeBtn.connect('button-press-event', (actor, event) => {
            if (this._isEditMode)
                return Clutter.EVENT_PROPAGATE;
            this._toggleMode();
            return Clutter.EVENT_STOP;
        });

        this._summaryLabel = new St.Label({
            text: '',
            style_class: 'prime-tray-summary',
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });
        headerBox.add_child(this._arrowIcon);
        headerBox.add_child(this._titleLabel);
        headerBox.add_child(this._modeBtn);
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
                this._toggleMode();
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
                orientation: Clutter.Orientation.HORIZONTAL,
                style_class: 'prime-socket-row',
                reactive: true,
                track_hover: true,
                can_focus: true,
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            const connLabel = new St.Label({
                text: '--',
                style_class: 'prime-socket-conn',
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            connLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const stateLabel = new St.Label({
                text: _('Established'),
                style_class: 'prime-socket-badge',
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.add_child(connLabel);
            row.add_child(stateLabel);
            const rowState = {rawPort: null, proc: ''};
            row.connect('button-press-event', (actor, event) => {
                if (this._isEditMode)
                    return Clutter.EVENT_PROPAGATE;
                if (event.get_button() === 1 && this._mode === 'listen' && rowState.rawPort) {
                    try {
                        Gio.AppInfo.launch_default_for_uri(`http://localhost:${rowState.rawPort}`, null);
                    } catch (e) {
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            this._contentBox.add_child(row);
            this._rows.push({row, connLabel, stateLabel, rowState});
        }
        this.add_child(this._contentBox);
    }

    _toggleMode() {
        this._mode = this._mode === 'estab' ? 'listen' : 'estab';
        this._titleLabel.set_text(this._mode === 'listen' ? _('Listeners') : _('Connections'));
        this._modeLabel.set_text(this._mode === 'listen' ? _('Listen') : _('Out'));
        this._update();
    }

    toggle() {
        this.setExpanded(!this._isExpanded);
    }

    _armTimer() {
        this._timerId = armTimeout(this._timerId, 5, () => {
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

        if (expanded || this._isHorizontal) {
            this._update();
            this._armTimer();
        } else {
            this._clearTimer();
        }
    }

    async _update() {
        if (!this._rows || this._updating)
            return;

        this._updating = true;
        const conns = await this._tracker.sampleAsync(this._mode, 5);
        this._updating = false;
        if (!this._rows)
            return;

        if (this._isHorizontal) {
            const noun = this._mode === 'listen' ? _('ports') : _('active');
            const countText = `${conns.length} ${noun}`;
            this._summaryLabel.set_text(countText);
            this._summaryLabel.visible = true;
        }

        if (!this._isExpanded)
            return;

        for (let i = 0; i < this._rows.length; i++) {
            const item = this._rows[i];
            if (i < conns.length) {
                const conn = conns[i];
                item.rowState.rawPort = conn.rawPort || null;
                item.rowState.proc = conn.proc || '';
                item.connLabel.set_text(String(conn.display || conn.remote || conn.local || '--'));
                if (this._mode === 'listen') {
                    item.stateLabel.set_text(String(conn.alias || _('Listen')));
                    item.stateLabel.style_class = 'prime-socket-badge prime-socket-badge-listen';
                } else {
                    item.stateLabel.set_text(String(conn.state || _('Established')));
                    item.stateLabel.style_class = 'prime-socket-badge';
                }
                item.row.visible = true;
            } else {
                item.rowState.rawPort = null;
                item.rowState.proc = '';
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
            this._armTimer();
        } else {
            this.remove_style_class_name('prime-tray-horizontal');
            this._summaryLabel.visible = false;
            if (!this._isExpanded)
                this._clearTimer();
        }
    }

    setEditMode(enabled) {
        this._isEditMode = !!enabled;
        this._headerButton.reactive = !enabled;
        this._headerButton.can_focus = !enabled;
        this._modeBtn.reactive = !enabled;
        this._modeBtn.can_focus = !enabled;
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
        this._rows = null;
        super.destroy();
    }
});
