import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import {getTheme, drawArc} from './Themes.js';

export const ClockDial = GObject.registerClass({
    GTypeName: 'MeridianClockDial',
}, class ClockDial extends St.BoxLayout {
    _init(params = {}) {
        super._init({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'meridian-card meridian-clock-card',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            reactive: true,
            track_hover: true,
            can_focus: true,
        });

        this._theme = getTheme(params.theme || 'cyan');
        this._scale = params.scale || 1.0;
        this._clockStyle = params.clockStyle || 'concentric';
        this._isEditMode = false;

        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3 && !this._isEditMode) {
                const styles = ['concentric', 'analog', 'digital'];
                const curIdx = styles.indexOf(this._clockStyle);
                const nextStyle = styles[(curIdx + 1) % styles.length];
                this.setClockStyle(nextStyle);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const canvasSize = Math.round(92 * this._scale);

        this._canvas = new St.DrawingArea({
            width: canvasSize,
            height: canvasSize,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            visible: (this._clockStyle !== 'digital'),
        });
        this._canvas.connect('repaint', this._onRepaint.bind(this));
        this.add_child(this._canvas);

        this._textBox = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'meridian-clock-text-box',
            x_expand: true,
        });

        this._timeLabel = new St.Label({
            text: '00:00',
            style_class: 'meridian-time-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._timeLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._timeLabel.clutter_text.line_wrap = false;

        this._dateBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'meridian-clock-date-box',
            x_expand: true,
        });

        this._dateLabel = new St.Label({
            text: '---, -- ---',
            style_class: 'meridian-date-label',
            x_align: Clutter.ActorAlign.END,
        });
        this._dateLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._dateLabel.clutter_text.line_wrap = false;

        this._subLabel = new St.Label({
            text: 'UP: --',
            style_class: 'meridian-uptime-label',
            x_align: Clutter.ActorAlign.END,
        });
        this._subLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._subLabel.clutter_text.line_wrap = false;

        this._dateBox.add_child(this._dateLabel);
        this._dateBox.add_child(this._subLabel);

        this._textBox.add_child(this._timeLabel);
        this._textBox.add_child(this._dateBox);

        this.add_child(this._textBox);

        this.updateTime();
        this._applyStyleLayout();
    }

    _applyStyleLayout() {
        const isDigital = (this._clockStyle === 'digital');
        if (this._canvas) {
            this._canvas.visible = !isDigital;
        }

        if (isDigital) {
            this.add_style_class_name('meridian-clock-header-mode');
            if (this._textBox.layout_manager) {
                this._textBox.layout_manager.orientation = Clutter.Orientation.HORIZONTAL;
            }
            this._dateBox.visible = true;
            this._dateBox.x_align = Clutter.ActorAlign.END;
            this._dateLabel.x_align = Clutter.ActorAlign.END;
            this._subLabel.x_align = Clutter.ActorAlign.END;
        } else {
            this.remove_style_class_name('meridian-clock-header-mode');
            if (this._textBox.layout_manager) {
                this._textBox.layout_manager.orientation = Clutter.Orientation.VERTICAL;
            }
            this._dateBox.x_align = Clutter.ActorAlign.START;
            this._dateLabel.x_align = Clutter.ActorAlign.START;
            this._subLabel.x_align = Clutter.ActorAlign.START;
        }

    }

    setClockStyle(style) {
        this._clockStyle = style || 'digital';
        this._applyStyleLayout();
        if (this._canvas && this._canvas.visible) {
            this._canvas.queue_repaint();
        }
    }

    setEditMode(enabled) {
        this._isEditMode = !!enabled;
    }

    setTheme(themeName) {
        this._theme = getTheme(themeName);
        if (this._canvas && this._canvas.visible) {
            this._canvas.queue_repaint();
        }
    }

    setScale(scale) {
        this._scale = scale;
        const size = Math.round(92 * scale);
        this._canvas.set_size(size, size);
        if (this._canvas.visible) {
            this._canvas.queue_repaint();
        }
    }

    setUptime(uptimeStr) {
        if (this._subLabel) {
            this._subLabel.set_text(`UP: ${uptimeStr}`);
        }
    }

    updateTime() {
        const now = GLib.DateTime.new_now_local();
        const hours = now.get_hour();
        const mins = now.get_minute();
        const secs = now.get_second();

        const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        const dateStr = now.format('%a, %d %b') || '';

        this._timeLabel.set_text(timeStr);
        this._dateLabel.set_text(dateStr.toUpperCase());

        this._hours = hours;
        this._mins = mins;
        this._secs = secs;

        if (this._canvas && this._canvas.visible) {
            this._canvas.queue_repaint();
        }
    }

    _onRepaint(area) {
        if (this._clockStyle === 'digital') return;

        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const cx = w / 2;
        const cy = h / 2;
        const baseR = (Math.min(w, h) / 2) - 4;
        const th = this._theme;

        if (this._clockStyle === 'concentric') {

            const secProg = (this._secs || 0) / 60;
            drawArc(cr, cx, cy, baseR, 3, secProg, th.track, th.primary);

            const minR = baseR - 7;
            const minProg = ((this._mins || 0) + secProg) / 60;
            drawArc(cr, cx, cy, minR, 3, minProg, th.track, th.secondary);

            const hrR = baseR - 14;
            const hrProg = (((this._hours || 0) % 12) + minProg) / 12;
            drawArc(cr, cx, cy, hrR, 3.5, hrProg, th.track, th.coral);

            const pipR = hrR - 5;
            cr.setLineWidth(1);
            cr.setLineCap(1);
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.20);
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI / 2) - (Math.PI / 2);
                cr.newSubPath();
                cr.moveTo(cx + Math.cos(angle) * (pipR - 2.5), cy + Math.sin(angle) * (pipR - 2.5));
                cr.lineTo(cx + Math.cos(angle) * pipR, cy + Math.sin(angle) * pipR);
                cr.stroke();
            }

            cr.selectFontFace('Sans', 0, 1);
            cr.setFontSize(Math.round(9 * this._scale));
            const ampm = (this._hours || 0) >= 12 ? 'PM' : 'AM';
            const extents = cr.textExtents(ampm);
            cr.moveTo(cx - (extents.width / 2), cy + (extents.height / 2));
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.85);
            cr.showText(ampm);
            cr.newPath();

        } else {

            const secProg = (this._secs || 0) / 60;
            drawArc(cr, cx, cy, baseR, 2.5, secProg, th.track, th.primary);

            const tickInnerR = baseR - 6;
            const tickOuterR = baseR - 2;
            cr.setLineWidth(1);
            cr.setLineCap(1);
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.25);
            for (let i = 0; i < 12; i++) {
                const angle = (i * Math.PI / 6) - (Math.PI / 2);
                cr.newSubPath();
                cr.moveTo(cx + Math.cos(angle) * tickInnerR, cy + Math.sin(angle) * tickInnerR);
                cr.lineTo(cx + Math.cos(angle) * tickOuterR, cy + Math.sin(angle) * tickOuterR);
                cr.stroke();
            }

            const handRadius = baseR - 8;
            const hourProg = (((this._hours || 0) % 12) / 12) + ((this._mins || 0) / 720);
            const hourAngle = (hourProg * 2 * Math.PI) - (Math.PI / 2);

            cr.newSubPath();
            cr.setLineWidth(3);
            cr.setLineCap(1);
            cr.setSourceRGBA(...th.primary);
            cr.moveTo(cx, cy);
            cr.lineTo(cx + Math.cos(hourAngle) * (handRadius * 0.52), cy + Math.sin(hourAngle) * (handRadius * 0.52));
            cr.stroke();

            const minProg = ((this._mins || 0) / 60) + ((this._secs || 0) / 3600);
            const minAngle = (minProg * 2 * Math.PI) - (Math.PI / 2);
            cr.newSubPath();
            cr.setLineWidth(2);
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.9);
            cr.moveTo(cx, cy);
            cr.lineTo(cx + Math.cos(minAngle) * (handRadius * 0.80), cy + Math.sin(minAngle) * (handRadius * 0.80));
            cr.stroke();

            const secAngle = (secProg * 2 * Math.PI) - (Math.PI / 2);
            cr.newSubPath();
            cr.setLineWidth(1);
            cr.setSourceRGBA(...th.coral);
            cr.moveTo(cx - Math.cos(secAngle) * 4, cy - Math.sin(secAngle) * 4);
            cr.lineTo(cx + Math.cos(secAngle) * handRadius, cy + Math.sin(secAngle) * handRadius);
            cr.stroke();

            cr.newSubPath();
            cr.arc(cx, cy, 2.5, 0, 2 * Math.PI);
            cr.setSourceRGBA(...th.primary);
            cr.fill();
        }

        cr.$dispose();
    }
});
