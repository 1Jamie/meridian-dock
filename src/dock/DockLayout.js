import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';

import {DEFAULT_MODULE_ORDER} from '../common/moduleOrder.js';

export class DockLayout {
    constructor({settings, cardMap, mem, disk, procsTray, socketsTray}) {
        this._settings = settings;
        this._cardMap = cardMap;
        this._mem = mem;
        this._disk = disk;
        this._procsTray = procsTray;
        this._socketsTray = socketsTray;
        this._onRelayout = null;
        this._userHidden = false;
        this._overviewSuppressed = false;
        this._chromeAdded = false;
        this._strutsEnabled = null;
        this._placed = null;
        this._clearance = null;
        this._idleRelayoutId = null;
        this._overviewSignals = [];
        this._monitorsChangedId = null;
        this._panelAllocationId = null;
        this._host = null;
        this._frame = null;
        this._spacer = null;
        this._inner = null;
    }

    setRelayoutListener(callback) {
        this._onRelayout = callback;
    }

    getHost() {
        return this._host;
    }

    getInner() {
        return this._inner;
    }

    getCardMap() {
        return this._cardMap;
    }

    getMonitor() {
        const monitorIdx = this._settings.get_int('monitor-index');
        let monitor = Main.layoutManager.primaryMonitor;
        if (monitorIdx >= 0 && monitorIdx < Main.layoutManager.monitors.length)
            monitor = Main.layoutManager.monitors[monitorIdx];
        return monitor || Main.layoutManager.primaryMonitor;
    }

    getDockPosition() {
        return this._settings.get_string('dock-position');
    }

    enable() {
        this._host = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'meridian-dock-host',
            reactive: false,
            x_expand: false,
            y_expand: false,
        });
        this._spacer = new St.Widget({
            reactive: false,
            x_expand: true,
            height: 0,
            visible: false,
        });
        this._frame = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            track_hover: true,
            x_expand: true,
            y_expand: true,
        });
        this._inner = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'meridian-dock-inner',
            x_expand: true,
            y_expand: true,
        });
        this._host.add_child(this._spacer);
        this._host.add_child(this._frame);
        this._frame.add_child(this._inner);
        this.applyModuleVisibility();
        this.applyCardPlacement();
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this.applyRelayout();
        });
        this._panelAllocationId = Main.layoutManager.panelBox.connect('notify::allocation', () => {
            this._onPanelAllocation();
        });
        this._overviewSignals = [
            Main.overview.connect('showing', () => this._onOverviewShowing()),
            Main.overview.connect('hiding', () => this._onOverviewHiding()),
        ];
        this.attach();
    }

    _wantsStruts() {
        if (this._userHidden)
            return false;
        if (this._settings.get_string('dock-length-mode') !== 'fill')
            return false;
        return this._settings.get_boolean('dock-affects-struts');
    }

    _topBarClearance(monitor) {
        const panel = Main.layoutManager.panelBox;
        const primary = Main.layoutManager.primaryMonitor;
        if (!panel || !primary || !monitor)
            return 0;
        if (monitor.x !== primary.x || monitor.y !== primary.y)
            return 0;
        if (monitor.width !== primary.width || monitor.height !== primary.height)
            return 0;
        return Math.max(0, Math.round(panel.height));
    }

    _onPanelAllocation() {
        if (!this._host)
            return;
        const clearance = this._topBarClearance(this.getMonitor());
        if (clearance === this._clearance)
            return;
        this.applyRelayout();
    }

    _raiseHost() {
        if (this._host && Main.layoutManager.uiGroup.contains(this._host))
            Main.layoutManager.uiGroup.set_child_above_sibling(this._host, null);
    }

    _syncPointer() {
        if (!this._frame || !this._host)
            return;
        this._frame.reactive = this._host.visible && !this._userHidden && !this._overviewSuppressed;
    }

    _placeHost(force) {
        if (!this._host || !this._placed)
            return;
        const {x, y, width, height} = this._placed;
        this._host.set_position(x, y);
        if (force && this._chromeAdded && width > 1)
            this._host.set_size(width - 1, height);
        this._host.set_size(width, height);
    }

    _releaseChrome() {
        if (!this._chromeAdded || !this._host)
            return;
        Main.layoutManager.removeChrome(this._host);
        this._chromeAdded = false;
        this._strutsEnabled = null;
    }

    _syncChrome() {
        if (!this._host)
            return;
        if (this._userHidden) {
            this._syncPointer();
            return;
        }
        const affectsStruts = this._wantsStruts();
        if (!this._chromeAdded || this._strutsEnabled !== affectsStruts) {
            if (this._chromeAdded) {
                Main.layoutManager.removeChrome(this._host);
                this._chromeAdded = false;
            }
            Main.layoutManager.addTopChrome(this._host, {
                affectsStruts,
                trackFullscreen: false,
            });
            this._chromeAdded = true;
            this._strutsEnabled = affectsStruts;
            this._placeHost(true);
        }
        this._raiseHost();
        this._syncPointer();
    }

    attach() {
        if (!this._host)
            return;
        this._host.opacity = this._userHidden ? 0 : 255;
        this._host.visible = !this._userHidden;
        this.applyRelayout();
        if (this._idleRelayoutId) {
            GLib.Source.remove(this._idleRelayoutId);
            this._idleRelayoutId = null;
        }
        this._idleRelayoutId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this.applyRelayout();
            this._idleRelayoutId = null;
            return GLib.SOURCE_REMOVE;
        });
    }

    applyCardPlacement() {
        if (!this._inner)
            return;

        for (const card of this._cardMap.values()) {
            card.remove_all_transitions();
            card.set_size(-1, -1);
            card.set_position(0, 0);
            card.queue_relayout();
            if (card.get_parent() === this._inner)
                this._inner.remove_child(card);
        }
        this._mem.set_size(-1, -1);
        this._mem.set_position(0, 0);
        this._mem.queue_relayout();
        this._disk.set_size(-1, -1);
        this._disk.set_position(0, 0);
        this._disk.queue_relayout();

        let modules = this._settings.get_strv('dock-modules');
        if (!modules || modules.length === 0)
            modules = [...DEFAULT_MODULE_ORDER];

        const attached = new Set();
        for (const id of modules) {
            const card = this._cardMap.get(id);
            if (card) {
                this._inner.add_child(card);
                attached.add(id);
            }
        }
        for (const [id, card] of this._cardMap) {
            if (!attached.has(id))
                this._inner.add_child(card);
        }
        this.applyCardOpacity();
        this.applyRelayout();
    }

    applyCardOpacity() {
        const cardOpacity = this._settings.get_int('card-opacity');
        const cardAlpha = Math.max(0, Math.min(1.0, cardOpacity / 100));
        const radius = Math.max(4, this._settings.get_int('dock-corner-radius'));
        const cardStyle = `background-color: rgba(12, 16, 24, ${cardAlpha.toFixed(2)}); border-radius: ${Math.max(6, radius - 4)}px;`;
        for (const card of this._cardMap.values())
            card.set_style(cardStyle);
    }

    applyModuleVisibility() {
        this._cardMap.get('clock').visible = this._settings.get_boolean('show-clock');
        this._cardMap.get('cpu').visible = this._settings.get_boolean('show-cpu');
        const showMem = this._settings.get_boolean('show-memory');
        const showDisk = this._settings.get_boolean('show-disk');
        this._mem.visible = showMem;
        this._disk.visible = showDisk;
        this._cardMap.get('memory_storage').visible = showMem || showDisk;
        this._cardMap.get('network').visible = this._settings.get_boolean('show-network');
        this._procsTray.visible = this._settings.get_boolean('show-processes');
        this._socketsTray.visible = this._settings.get_boolean('show-connections');
    }

    toggleVisibility() {
        if (!this._host)
            return;
        this._userHidden = !this._userHidden;
        if (this._userHidden) {
            this._syncPointer();
            this._host.ease({
                opacity: 0,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this._userHidden && this._host) {
                        this._host.visible = false;
                        this._releaseChrome();
                    }
                },
            });
        } else {
            this._host.visible = true;
            this._syncPointer();
            this._syncChrome();
            this._host.ease({
                opacity: 255,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    applyOverviewSetting() {
        if (!Main.overview.visible || !this._host)
            return;
        const show = this._settings.get_boolean('show-in-overview');
        this._overviewSuppressed = !show;
        this._host.visible = show && !this._userHidden;
        this._syncPointer();
        this._syncChrome();
    }

    _onOverviewShowing() {
        if (!this._host)
            return;
        const show = this._settings.get_boolean('show-in-overview');
        this._overviewSuppressed = !show;
        if (!show) {
            this._host.visible = false;
        } else if (!this._userHidden) {
            this._host.visible = true;
            this._host.opacity = 255;
        }
        this._syncPointer();
        this._syncChrome();
    }

    _onOverviewHiding() {
        if (!this._host)
            return;
        this._overviewSuppressed = false;
        if (this._userHidden) {
            this._host.visible = false;
            this._host.opacity = 0;
        } else {
            this._host.visible = true;
            this._host.opacity = 255;
        }
        this._syncPointer();
        this._syncChrome();
    }

    applyRelayout() {
        if (!this._host || !this._inner)
            return;
        const monitor = this.getMonitor();
        if (!monitor)
            return;

        const pos = this.getDockPosition();
        const lengthMode = this._settings.get_string('dock-length-mode');
        const alignment = this._settings.get_string('dock-alignment');
        const isVertical = pos === 'left' || pos === 'right';
        const thickness = Math.max(200, Math.min(480, this._settings.get_int('dock-thickness')));
        const margin = Math.max(0, this._settings.get_int('dock-margin'));
        const radius = Math.max(4, this._settings.get_int('dock-corner-radius'));
        const dockOpacity = Math.max(0, Math.min(100, this._settings.get_int('dock-opacity')));
        const dockAlpha = (dockOpacity / 100).toFixed(2);
        const scale = this._settings.get_double('scale-factor') || 1.0;
        const targetThickness = Math.round(thickness * scale);
        const orient = isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        this._host.set_orientation(Clutter.Orientation.VERTICAL);
        this._frame.set_orientation(orient);
        this._inner.set_orientation(orient);
        this._procsTray.setHorizontal(!isVertical);
        this._socketsTray.setHorizontal(!isVertical);

        const orientClass = isVertical ? 'meridian-dock-vertical' : 'meridian-dock-horizontal';
        const otherClass = isVertical ? 'meridian-dock-horizontal' : 'meridian-dock-vertical';
        for (const actor of [this._host, this._frame, this._inner]) {
            actor.remove_style_class_name(otherClass);
            actor.add_style_class_name(orientClass);
        }

        let posX;
        let posY;
        let hostWidth;
        let hostHeight;

        const clearance = this._topBarClearance(monitor);
        this._clearance = clearance;
        let topSpacer = 0;

        if (isVertical) {
            hostWidth = targetThickness;
            if (lengthMode === 'fill') {
                hostHeight = Math.max(120, monitor.height - clearance);
                posX = pos === 'left' ? monitor.x : (monitor.x + monitor.width - hostWidth);
                posY = monitor.y + clearance;
                const edge = pos === 'left' ? 'right' : 'left';
                this._frame.set_style(
                    `background-color: rgba(10, 14, 22, ${dockAlpha}); ` +
                    `border-${edge}: 1px solid rgba(255, 255, 255, 0.12); ` +
                    `padding: ${margin}px 8px;`
                );
            } else {
                const [, prefHeight] = this._inner.get_preferred_height(hostWidth);
                const maxAvailableHeight = monitor.height - clearance - (margin * 2);
                hostHeight = Math.min(maxAvailableHeight, Math.max(120, prefHeight + 20));
                posX = pos === 'left' ? (monitor.x + margin) : (monitor.x + monitor.width - hostWidth - margin);
                const startY = monitor.y + clearance + margin;
                if (alignment === 'start')
                    posY = startY;
                else if (alignment === 'end')
                    posY = monitor.y + monitor.height - hostHeight - margin;
                else
                    posY = monitor.y + clearance + Math.round((monitor.height - clearance - hostHeight) / 2);
                posY = Math.max(startY, posY);
                this._frame.set_style(
                    `background-color: rgba(10, 14, 22, ${dockAlpha}); ` +
                    `border: 1px solid rgba(255, 255, 255, 0.15); ` +
                    `border-radius: ${radius}px; padding: 10px 8px; ` +
                    `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);`
                );
            }
        } else if (lengthMode === 'fill') {
            hostWidth = monitor.width;
            posX = monitor.x;
            if (pos === 'top') {
                topSpacer = clearance;
                hostHeight = targetThickness + topSpacer;
                posY = monitor.y;
            } else {
                hostHeight = targetThickness;
                posY = monitor.y + monitor.height - hostHeight;
            }
            const edge = pos === 'top' ? 'bottom' : 'top';
            this._frame.set_style(
                `background-color: rgba(10, 14, 22, ${dockAlpha}); ` +
                `border-${edge}: 1px solid rgba(255, 255, 255, 0.12); ` +
                `padding: 8px ${margin}px;`
            );
        } else {
            hostHeight = targetThickness;
            const [, prefWidth] = this._inner.get_preferred_width(hostHeight);
            const maxAvailableWidth = monitor.width - (margin * 2);
            hostWidth = Math.min(maxAvailableWidth, Math.max(260, prefWidth + 24));
            const topLimit = monitor.y + clearance + margin;
            posY = pos === 'top' ? topLimit : (monitor.y + monitor.height - hostHeight - margin);
            if (alignment === 'start')
                posX = monitor.x + margin;
            else if (alignment === 'end')
                posX = monitor.x + monitor.width - hostWidth - margin;
            else
                posX = monitor.x + Math.round((monitor.width - hostWidth) / 2);
            this._frame.set_style(
                `background-color: rgba(10, 14, 22, ${dockAlpha}); ` +
                `border: 1px solid rgba(255, 255, 255, 0.15); ` +
                `border-radius: ${radius}px; padding: 8px 12px; ` +
                `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);`
            );
        }

        this._spacer.height = topSpacer;
        this._spacer.visible = topSpacer > 0;
        this._placed = {x: posX, y: posY, width: hostWidth, height: hostHeight};
        this._placeHost(false);
        this._syncChrome();
        if (this._onRelayout)
            this._onRelayout();
    }

    destroy() {
        if (this._idleRelayoutId) {
            GLib.Source.remove(this._idleRelayoutId);
            this._idleRelayoutId = null;
        }
        for (const id of this._overviewSignals)
            Main.overview.disconnect(id);
        this._overviewSignals = [];
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._panelAllocationId) {
            Main.layoutManager.panelBox.disconnect(this._panelAllocationId);
            this._panelAllocationId = null;
        }
        if (this._chromeAdded && this._host) {
            Main.layoutManager.removeChrome(this._host);
            this._chromeAdded = false;
        }
        if (this._host) {
            this._host.destroy();
            this._host = null;
            this._frame = null;
            this._spacer = null;
            this._inner = null;
        }
        this._onRelayout = null;
        this._settings = null;
    }
}
