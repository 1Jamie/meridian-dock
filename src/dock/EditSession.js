import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

function iconButton(iconName, styleClass) {
    const button = new St.Button({
        style_class: styleClass,
        can_focus: true,
    });
    button.set_child(new St.Icon({
        icon_name: iconName,
        icon_size: 16,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    return button;
}

function labeledButton(iconName, text, styleClass) {
    const button = new St.Button({
        style_class: styleClass,
        can_focus: true,
    });
    const box = new St.BoxLayout({
        orientation: Clutter.Orientation.HORIZONTAL,
        y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(new St.Icon({
        icon_name: iconName,
        icon_size: 14,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    box.add_child(new St.Label({
        text,
        y_align: Clutter.ActorAlign.CENTER,
    }));
    button.set_child(box);
    return button;
}

export class EditSession {
    constructor({settings, dock, editable, mem, disk}) {
        this._settings = settings;
        this._dock = dock;
        this._editable = editable;
        this._mem = mem;
        this._disk = disk;
        this._active = false;
        this._inspector = null;
        this._stageMotionId = null;
        this._stageReleaseId = null;
        this._stageKeyId = null;
        this._idleId = null;
        this._draggedCard = null;
        this._dragPlaceholder = null;
        this._cardSignals = [];

        const cardMap = dock.getCardMap();
        for (const [id, card] of cardMap)
            this._connectCard(card, id, card);
        this._connectCard(mem, 'memory_storage', cardMap.get('memory_storage'));
        this._connectCard(disk, 'memory_storage', cardMap.get('memory_storage'));
    }

    _connectCard(trigger, cardId, target) {
        const id = trigger.connect('button-press-event', (actor, event) => {
            if (!this._active)
                return Clutter.EVENT_PROPAGATE;
            if (event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;
            this._startCardDrag(target, cardId, event);
            return Clutter.EVENT_STOP;
        });
        this._cardSignals.push([trigger, id]);
    }

    toggle(force = undefined) {
        const next = force === undefined ? !this._active : force;
        if (this._active === next)
            return;
        this._active = next;
        for (const widget of this._editable)
            widget.setEditMode(this._active);

        const cards = this._dock.getCardMap().values();
        if (this._active) {
            for (const card of cards)
                card.add_style_class_name('meridian-card-editing');
            this._showInspector();
            this._dock.applyRelayout();
            if (!this._stageKeyId) {
                this._stageKeyId = global.stage.connect('key-press-event', (stage, event) => {
                    if (event.get_key_symbol() === Clutter.KEY_Escape) {
                        this.toggle(false);
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                });
            }
        } else {
            this._leaveEditMode(cards);
        }
    }

    _leaveEditMode(cards) {
        for (const card of cards) {
            card.remove_style_class_name('meridian-card-editing');
            card.remove_style_class_name('meridian-card-dragging');
            card.set_size(-1, -1);
            card.set_position(0, 0);
            card.queue_relayout();
        }
        this._mem.set_size(-1, -1);
        this._mem.set_position(0, 0);
        this._mem.queue_relayout();
        this._disk.set_size(-1, -1);
        this._disk.set_position(0, 0);
        this._disk.queue_relayout();
        this._hideInspector();
        this._finishDrag();
        if (this._stageKeyId) {
            global.stage.disconnect(this._stageKeyId);
            this._stageKeyId = null;
        }
        this._dock.applyRelayout();
    }

    _clearIdle() {
        if (this._idleId) {
            GLib.Source.remove(this._idleId);
            this._idleId = null;
        }
    }

    reposition() {
        if (!this._inspector || !this._active)
            return;
        if (this._idleId) {
            GLib.Source.remove(this._idleId);
            this._idleId = null;
        }
        this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._idleId = null;
            this._placeInspector();
            return GLib.SOURCE_REMOVE;
        });
    }

    _placeInspector() {
        if (!this._inspector)
            return;
        const monitor = this._dock.getMonitor();
        const host = this._dock.getHost();
        if (!monitor || !host)
            return;
        const [dockX, dockY] = host.get_position();
        const [dockW, dockH] = host.get_size();
        const [paletteW, paletteH] = this._inspector.get_size();
        const edge = this._dock.getDockPosition();
        let palX;
        let palY;
        if (edge === 'right') {
            palX = Math.max(monitor.x + 20, dockX - paletteW - 20);
            palY = monitor.y + 40;
        } else if (edge === 'left') {
            palX = Math.min(monitor.x + monitor.width - paletteW - 20, dockX + dockW + 20);
            palY = monitor.y + 40;
        } else if (edge === 'top') {
            palX = monitor.x + Math.round((monitor.width - paletteW) / 2);
            palY = Math.min(monitor.y + monitor.height - paletteH - 20, dockY + dockH + 20);
        } else {
            palX = monitor.x + Math.round((monitor.width - paletteW) / 2);
            palY = Math.max(monitor.y + 20, dockY - paletteH - 20);
        }
        this._inspector.set_position(palX, palY);
    }

    _showInspector() {
        if (this._inspector)
            return;

        this._inspector = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'meridian-dock-inspector',
            reactive: true,
            can_focus: true,
        });

        const headerBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-inspector-header',
        });
        headerBox.add_child(new St.Icon({
            icon_name: 'preferences-system-symbolic',
            icon_size: 16,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        headerBox.add_child(new St.Label({
            text: _('Dock Customizer'),
            style_class: 'meridian-inspector-title',
            x_expand: true,
        }));
        const doneBtn = new St.Button({
            label: _('Done'),
            style_class: 'meridian-inspector-btn meridian-btn-done',
            can_focus: true,
        });
        doneBtn.connect('clicked', () => this.toggle(false));
        headerBox.add_child(doneBtn);
        this._inspector.add_child(headerBox);

        this._addMonitorRow();
        this._addEdgeRow();
        this._addSpanRow();
        this._addThicknessRow();
        this._addModuleRow();

        Main.layoutManager.uiGroup.add_child(this._inspector);
        this.reposition();
    }

    _addMonitorRow() {
        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-inspector-row',
        });
        row.add_child(new St.Label({
            text: _('Display'),
            style_class: 'meridian-inspector-sub',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const nMonitors = Main.layoutManager.monitors.length;
        const current = this._settings.get_int('monitor-index');
        let text = _('Display 1');
        if (nMonitors > 1)
            text = current === -1 ? _('Primary') : `${_('Display')} ${current + 1}`;
        const value = new St.Label({
            text,
            style_class: 'meridian-inspector-val',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const cycle = delta => {
            const count = Main.layoutManager.monitors.length;
            if (count <= 1)
                return;
            let active = this._settings.get_int('monitor-index');
            if (active < 0 || active >= count) {
                active = Main.layoutManager.primaryIndex >= 0
                    ? Main.layoutManager.primaryIndex
                    : 0;
            }
            const next = (active + delta + count) % count;
            this._settings.set_int('monitor-index', next);
            value.set_text(`${_('Display')} ${next + 1}`);
        };
        const prev = iconButton('go-previous-symbolic', 'meridian-inspector-btn');
        const next = iconButton('go-next-symbolic', 'meridian-inspector-btn');
        prev.connect('clicked', () => cycle(-1));
        next.connect('clicked', () => cycle(1));
        row.add_child(prev);
        row.add_child(value);
        row.add_child(next);
        this._inspector.add_child(row);
    }

    _addEdgeRow() {
        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-inspector-row',
        });
        row.add_child(new St.Label({
            text: _('Edge'),
            style_class: 'meridian-inspector-sub',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const edges = [
            {id: 'left', icon: 'pan-start-symbolic', label: _('Left')},
            {id: 'top', icon: 'pan-up-symbolic', label: _('Top')},
            {id: 'bottom', icon: 'pan-down-symbolic', label: _('Bottom')},
            {id: 'right', icon: 'pan-end-symbolic', label: _('Right')},
        ];
        const current = this._dock.getDockPosition();
        for (const edge of edges) {
            const style = `meridian-inspector-btn ${current === edge.id ? 'meridian-btn-active' : ''}`;
            const button = labeledButton(edge.icon, edge.label, style);
            button.connect('clicked', () => {
                this._settings.set_string('dock-position', edge.id);
                this._refreshInspector();
            });
            row.add_child(button);
        }
        this._inspector.add_child(row);
    }

    _addSpanRow() {
        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-inspector-row',
        });
        row.add_child(new St.Label({
            text: _('Span'),
            style_class: 'meridian-inspector-sub',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const mode = this._settings.get_string('dock-length-mode');
        const fillBtn = new St.Button({
            label: _('Full Edge'),
            style_class: `meridian-inspector-btn ${mode === 'fill' ? 'meridian-btn-active' : ''}`,
            can_focus: true,
        });
        const compactBtn = new St.Button({
            label: _('Floating Island'),
            style_class: `meridian-inspector-btn ${mode === 'compact' ? 'meridian-btn-active' : ''}`,
            can_focus: true,
        });
        fillBtn.connect('clicked', () => {
            this._settings.set_string('dock-length-mode', 'fill');
            this._refreshInspector();
        });
        compactBtn.connect('clicked', () => {
            this._settings.set_string('dock-length-mode', 'compact');
            this._refreshInspector();
        });
        row.add_child(fillBtn);
        row.add_child(compactBtn);
        this._inspector.add_child(row);
    }

    _addThicknessRow() {
        const row = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-inspector-row',
        });
        row.add_child(new St.Label({
            text: _('Thickness'),
            style_class: 'meridian-inspector-sub',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        const current = this._settings.get_int('dock-thickness');
        const value = new St.Label({
            text: `${current}px`,
            style_class: 'meridian-inspector-val',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const change = delta => {
            const next = Math.max(200, Math.min(480, this._settings.get_int('dock-thickness') + delta));
            this._settings.set_int('dock-thickness', next);
            value.set_text(`${next}px`);
        };
        const minus = new St.Button({
            label: '-10',
            style_class: 'meridian-inspector-btn',
            can_focus: true,
        });
        const plus = new St.Button({
            label: _('+10'),
            style_class: 'meridian-inspector-btn',
            can_focus: true,
        });
        minus.connect('clicked', () => change(-10));
        plus.connect('clicked', () => change(10));
        row.add_child(minus);
        row.add_child(value);
        row.add_child(plus);
        this._inspector.add_child(row);
    }

    _addModuleRow() {
        const stash = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'meridian-inspector-stash',
        });
        stash.add_child(new St.Label({
            text: _('Modules'),
            style_class: 'meridian-inspector-sub',
        }));
        const modulesRow = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-inspector-modules-row',
        });
        const modules = [
            {id: 'show-clock', name: _('Clock')},
            {id: 'show-cpu', name: _('CPU')},
            {id: 'show-memory', name: _('RAM')},
            {id: 'show-disk', name: _('Disk')},
            {id: 'show-network', name: _('Net')},
            {id: 'show-processes', name: _('Procs')},
            {id: 'show-connections', name: _('Conns')},
        ];
        for (const module of modules) {
            const shown = this._settings.get_boolean(module.id);
            const button = new St.Button({
                style_class: `meridian-inspector-chip ${shown ? 'meridian-chip-active' : ''}`,
                can_focus: true,
            });
            const box = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const icon = new St.Icon({
                icon_name: shown ? 'emblem-ok-symbolic' : 'list-add-symbolic',
                icon_size: 12,
                y_align: Clutter.ActorAlign.CENTER,
            });
            box.add_child(icon);
            box.add_child(new St.Label({
                text: module.name,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            button.set_child(box);
            button.connect('clicked', () => {
                const next = !this._settings.get_boolean(module.id);
                this._settings.set_boolean(module.id, next);
                icon.icon_name = next ? 'emblem-ok-symbolic' : 'list-add-symbolic';
                if (next)
                    button.add_style_class_name('meridian-chip-active');
                else
                    button.remove_style_class_name('meridian-chip-active');
            });
            modulesRow.add_child(button);
        }
        stash.add_child(modulesRow);
        this._inspector.add_child(stash);
    }

    _refreshInspector() {
        if (!this._inspector)
            return;
        this._hideInspector();
        this._showInspector();
    }

    _hideInspector() {
        this._clearIdle();
        if (!this._inspector)
            return;
        const parent = this._inspector.get_parent();
        if (parent)
            parent.remove_child(this._inspector);
        this._inspector.destroy();
        this._inspector = null;
    }

    _startCardDrag(card, cardId, event) {
        this._finishDrag();
        const inner = this._dock.getInner();
        const [cardStageX, cardStageY] = card.get_transformed_position();
        const [cardW, cardH] = card.get_size();
        const [startStageX, startStageY] = event.get_coords();
        const grabOffsetX = startStageX - cardStageX;
        const grabOffsetY = startStageY - cardStageY;
        const pos = this._dock.getDockPosition();
        const isVertical = pos === 'left' || pos === 'right';
        this._draggedCard = card;

        this._dragPlaceholder = new St.Widget({
            style_class: 'meridian-dock-placeholder',
            reactive: false,
            x_expand: isVertical,
            y_expand: !isVertical,
        });
        this._dragPlaceholder.set_size(Math.max(40, cardW), Math.max(40, cardH));
        inner.insert_child_below(this._dragPlaceholder, card);
        if (card.get_parent() === inner)
            inner.remove_child(card);
        Main.layoutManager.uiGroup.add_child(card);
        Main.layoutManager.uiGroup.set_child_above_sibling(card, null);
        card.add_style_class_name('meridian-card-dragging');
        card.set_size(cardW, cardH);
        card.set_position(cardStageX, cardStageY);

        this._stageMotionId = global.stage.connect('motion-event', (stage, motionEvt) => {
            const [curX, curY] = motionEvt.get_coords();
            card.set_position(curX - grabOffsetX, curY - grabOffsetY);
            const siblings = inner.get_children().filter(child => child.visible && child !== this._dragPlaceholder);
            if (siblings.length > 0) {
                let targetSibling = null;
                for (const sibling of siblings) {
                    const [sibX, sibY] = sibling.get_transformed_position();
                    const mid = isVertical ? (sibY + (sibling.height / 2)) : (sibX + (sibling.width / 2));
                    const pointer = isVertical ? curY : curX;
                    if (pointer < mid) {
                        targetSibling = sibling;
                        break;
                    }
                }
                if (targetSibling)
                    inner.set_child_below_sibling(this._dragPlaceholder, targetSibling);
                else
                    inner.set_child_above_sibling(this._dragPlaceholder, siblings[siblings.length - 1]);
            }
            return Clutter.EVENT_STOP;
        });
        this._stageReleaseId = global.stage.connect('button-release-event', () => {
            this._endCardDrag(cardId);
            return Clutter.EVENT_STOP;
        });
    }

    _endCardDrag() {
        this._finishDrag();
        const newOrder = [];
        for (const child of this._dock.getInner().get_children()) {
            for (const [id, card] of this._dock.getCardMap()) {
                if (card === child) {
                    newOrder.push(id);
                    break;
                }
            }
        }
        for (const id of this._settings.get_strv('dock-modules')) {
            if (!newOrder.includes(id))
                newOrder.push(id);
        }
        this._settings.set_strv('dock-modules', newOrder);
    }

    _finishDrag() {
        if (this._stageMotionId) {
            global.stage.disconnect(this._stageMotionId);
            this._stageMotionId = null;
        }
        if (this._stageReleaseId) {
            global.stage.disconnect(this._stageReleaseId);
            this._stageReleaseId = null;
        }
        if (!this._draggedCard)
            return;

        const card = this._draggedCard;
        const inner = this._dock.getInner();
        card.remove_style_class_name('meridian-card-dragging');
        if (card.get_parent() === Main.layoutManager.uiGroup)
            Main.layoutManager.uiGroup.remove_child(card);
        if (this._dragPlaceholder && this._dragPlaceholder.get_parent() === inner) {
            inner.insert_child_below(card, this._dragPlaceholder);
            inner.remove_child(this._dragPlaceholder);
            this._dragPlaceholder.destroy();
            this._dragPlaceholder = null;
        } else if (card.get_parent() !== inner) {
            inner.add_child(card);
        }
        card.set_size(-1, -1);
        card.set_position(0, 0);
        card.queue_relayout();
        this._draggedCard = null;
    }

    destroy() {
        if (this._active)
            this.toggle(false);
        this._finishDrag();
        this._hideInspector();
        for (const [actor, id] of this._cardSignals)
            actor.disconnect(id);
        this._cardSignals = [];
        if (this._stageKeyId) {
            global.stage.disconnect(this._stageKeyId);
            this._stageKeyId = null;
        }
        this._dock = null;
        this._settings = null;
    }
}
