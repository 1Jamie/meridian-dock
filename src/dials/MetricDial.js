import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {getTheme, drawArc} from './Themes.js';

export const MetricDial = GObject.registerClass({
    GTypeName: 'PrimeMetricDial',
    Properties: {
        'interpolated_value': GObject.ParamSpec.double(
            'interpolated_value',
            'InterpolatedValue',
            'Animated metric progress value',
            GObject.ParamFlags.READWRITE,
            0.0, 100.0, 0.0
        ),
        'interpolated_secondary': GObject.ParamSpec.double(
            'interpolated_secondary',
            'InterpolatedSecondary',
            'Animated secondary progress value',
            GObject.ParamFlags.READWRITE,
            0.0, 100.0, 0.0
        ),
    },
}, class MetricDial extends St.BoxLayout {
    get interpolated_value() {
        return this._percent;
    }

    set interpolated_value(v) {
        if (Math.abs(this._percent - v) > 0.02) {
            this._percent = v;
            this._invalidateCanvas();
        }
    }

    get interpolated_secondary() {
        return this._secondaryPercent;
    }

    set interpolated_secondary(v) {
        if (Math.abs(this._secondaryPercent - v) > 0.02) {
            this._secondaryPercent = v;
            this._invalidateCanvas();
        }
    }

    _init(params = {}) {
        const isCompact = !!params.compact;
        super._init({
            orientation: isCompact ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
            style_class: `prime-card prime-${params.type || 'metric'}-card ${isCompact ? 'prime-mini-card' : ''}`,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            reactive: true,
            track_hover: true,
            can_focus: true,
        });

        this._type = params.type || 'generic';
        this._theme = getTheme(params.theme || 'cyan');
        this._scale = params.scale || 1.0;
        this._compact = isCompact;
        this._enableInterpolation = params.enableInterpolation !== false;

        this._percent = 0;
        this._secondaryPercent = 0;
        this._title = params.title || 'METRIC';
        this._valueText = '--';
        this._subText = '--';
        this._detailMode = false;
        this._isEditMode = false;

        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3 && !this._isEditMode) {
                this._detailMode = !this._detailMode;
                this._invalidateCanvas();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const canvasSize = Math.round((isCompact ? 68 : 84) * this._scale);

        if (isCompact) {
            this._headerLabel = new St.Label({
                text: this._title,
                style_class: 'prime-card-header',
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._headerLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._headerLabel.clutter_text.line_wrap = false;
            this.add_child(this._headerLabel);

            this._canvas = new St.DrawingArea({
                width: canvasSize,
                height: canvasSize,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._canvas.connect('repaint', this._onRepaint.bind(this));
            this.add_child(this._canvas);

            const statBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'prime-mini-stat-box',
                x_expand: true,
            });

            this._valueLabel = new St.Label({
                text: '--',
                style_class: 'prime-mini-value',
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._valueLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._valueLabel.clutter_text.line_wrap = false;

            this._subLabel = new St.Label({
                text: '--',
                style_class: 'prime-dim-label',
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._subLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._subLabel.clutter_text.line_wrap = false;

            statBox.add_child(this._valueLabel);
            statBox.add_child(this._subLabel);
            this.add_child(statBox);
        } else if (this._type === 'network') {
            this._canvas = new St.DrawingArea({
                width: canvasSize,
                height: canvasSize,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._canvas.connect('repaint', this._onRepaint.bind(this));
            this.add_child(this._canvas);

            const infoBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'prime-metric-info-box',
                x_expand: true,
            });

            this._headerLabel = new St.Label({
                text: 'NETWORK',
                style_class: 'prime-card-header',
                x_expand: true,
            });
            this._headerLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._headerLabel.clutter_text.line_wrap = false;

            this._downLabel = new St.Label({
                text: '0 B/s',
                style_class: 'prime-net-down-label',
                x_expand: true,
            });
            this._downLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._downLabel.clutter_text.line_wrap = false;

            this._upLabel = new St.Label({
                text: '0 B/s',
                style_class: 'prime-net-up-label',
                x_expand: true,
            });
            this._upLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._upLabel.clutter_text.line_wrap = false;

            const subBox = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'prime-net-sub-box',
                x_expand: true,
            });

            this._statusDot = new St.Widget({
                style_class: 'prime-net-status-dot',
                y_align: Clutter.ActorAlign.CENTER,
            });

            this._subLabel = new St.Label({
                text: '--',
                style_class: 'prime-dim-label',
                y_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
            });
            this._subLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._subLabel.clutter_text.line_wrap = false;

            subBox.add_child(this._statusDot);
            subBox.add_child(this._subLabel);

            infoBox.add_child(this._headerLabel);
            infoBox.add_child(this._downLabel);
            infoBox.add_child(this._upLabel);
            infoBox.add_child(subBox);
            this.add_child(infoBox);
            this._applyThemeColors();
        } else {
            this._canvas = new St.DrawingArea({
                width: canvasSize,
                height: canvasSize,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
            this._canvas.connect('repaint', this._onRepaint.bind(this));
            this.add_child(this._canvas);

            const infoBox = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'prime-metric-info-box',
                x_expand: true,
            });

            this._headerLabel = new St.Label({
                text: this._title,
                style_class: 'prime-card-header',
                x_expand: true,
            });
            this._headerLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._headerLabel.clutter_text.line_wrap = false;

            this._valueLabel = new St.Label({
                text: '--',
                style_class: 'prime-metric-value',
                x_expand: true,
            });
            this._valueLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._valueLabel.clutter_text.line_wrap = false;

            this._subLabel = new St.Label({
                text: '--',
                style_class: 'prime-dim-label',
                x_expand: true,
            });
            this._subLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._subLabel.clutter_text.line_wrap = false;

            infoBox.add_child(this._headerLabel);
            infoBox.add_child(this._valueLabel);
            infoBox.add_child(this._subLabel);
            this.add_child(infoBox);
        }
    }

    _applyThemeColors() {
        if (!this._theme) return;
        const p = this._theme.primary;
        const s = this._theme.secondary;

        if (this._downLabel) {
            this._downLabel.set_style(
                `color: rgba(${Math.round(p[0] * 255)}, ${Math.round(p[1] * 255)}, ${Math.round(p[2] * 255)}, ${p[3] || 0.95});`
            );
        }
        if (this._upLabel) {
            this._upLabel.set_style(
                `color: rgba(${Math.round(s[0] * 255)}, ${Math.round(s[1] * 255)}, ${Math.round(s[2] * 255)}, ${s[3] || 0.90});`
            );
        }
        if (this._statusDot) {
            const isGreenTheme = this._theme.id === 'green';
            const dotRgba = isGreenTheme
                ? 'rgba(0, 230, 118, 0.95)'
                : 'rgba(0, 229, 255, 0.95)';
            this._statusDot.set_style(
                `background-color: ${dotRgba}; width: 5px; height: 5px; border-radius: 3px; margin-right: 5px;`
            );
        }
    }

    setEditMode(enabled) {
        this._isEditMode = !!enabled;
    }

    setTheme(themeName) {
        this._theme = getTheme(themeName);
        this._applyThemeColors();
        this._canvas.queue_repaint();
    }

    setScale(scale) {
        this._scale = scale;
        const size = Math.round((this._compact ? 68 : 84) * scale);
        this._canvas.set_size(size, size);
        this._canvas.queue_repaint();
    }

    setInterpolation(enabled) {
        this._enableInterpolation = !!enabled;
    }

    _invalidateCanvas() {
        this._canvas.queue_repaint();
    }

    updateMetric(percent, valueText, subText, secondaryPercent = 0, downFormatted = null, upFormatted = null) {
        const targetPercent = Math.min(100, Math.max(0, percent || 0));
        const targetSecondary = Math.min(100, Math.max(0, secondaryPercent || 0));
        this._valueText = valueText || '--';
        this._subText = subText || '--';

        if (this._type === 'network' && this._downLabel && this._upLabel) {
            const downStr = downFormatted || (valueText ? valueText.split('   ')[0] : '0 B/s');
            const upStr = upFormatted || (valueText ? valueText.split('   ')[1] : '0 B/s');
            this._downLabel.set_text(downStr);
            this._upLabel.set_text(upStr);
        } else if (this._valueLabel) {
            if (this._type === 'network' && (downFormatted || upFormatted)) {
                this._valueLabel.set_text(`${downFormatted || '0 B/s'}  ${upFormatted || '0 B/s'}`);
            } else {
                this._valueLabel.set_text(this._valueText);
            }
        }

        if (this._subLabel) {
            this._subLabel.set_text(this._subText);
        }

        if (this._enableInterpolation) {
            const isRampingUp = targetPercent > this._percent;
            const duration = isRampingUp ? 180 : 650;
            const mode = isRampingUp
                ? Clutter.AnimationMode.EASE_OUT_QUAD
                : Clutter.AnimationMode.EASE_OUT_CUBIC;

            this.remove_transition('interpolated_value');
            this.ease_property('interpolated_value', targetPercent, {
                duration,
                mode,
            });

            if (Math.abs(this._secondaryPercent - targetSecondary) > 0.05) {
                const isSecRampingUp = targetSecondary > this._secondaryPercent;
                const secDuration = isSecRampingUp ? 180 : 650;
                const secMode = isSecRampingUp
                    ? Clutter.AnimationMode.EASE_OUT_QUAD
                    : Clutter.AnimationMode.EASE_OUT_CUBIC;

                this.remove_transition('interpolated_secondary');
                this.ease_property('interpolated_secondary', targetSecondary, {
                    duration: secDuration,
                    mode: secMode,
                });
            }
        } else {
            this._percent = targetPercent;
            this._secondaryPercent = targetSecondary;
            this._invalidateCanvas();
        }
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const cx = w / 2;
        const cy = h / 2;
        const maxR = (Math.min(w, h) / 2) - 4;
        const th = this._theme;

        if (this._type === 'network') {
            const dialR = maxR;
            const arcWidth = Math.max(3.2, Math.round(3.5 * this._scale));
            const gap = 0.08; // ~4.6° visual decoupling notch at apex and nadir

            const hasDown = this._percent > 0.5;
            const hasUp = this._secondaryPercent > 0.5;
            const scale = this._scale || 1.0;
            const offset = Math.round(5.5 * scale);
            const dX = cx - offset;
            const uX = cx + offset;
            const arrowH = 6 * scale;
            const headW = 3.5 * scale;
            const headH = 3.5 * scale;
            const arrowWidth = Math.max(1.8, 1.8 * scale);

            if (hasDown) {
                cr.newSubPath();
                cr.setLineWidth(arrowWidth + 2);
                cr.setLineCap(1);
                cr.setSourceRGBA(th.primary[0], th.primary[1], th.primary[2], 0.20);
                cr.moveTo(dX, cy - arrowH);
                cr.lineTo(dX, cy + arrowH);
                cr.moveTo(dX - headW, cy + arrowH - headH);
                cr.lineTo(dX, cy + arrowH);
                cr.lineTo(dX + headW, cy + arrowH - headH);
                cr.stroke();
            }
            cr.newSubPath();
            cr.setLineWidth(arrowWidth);
            cr.setLineCap(1);
            cr.setSourceRGBA(...(hasDown ? th.primary : [1.0, 1.0, 1.0, 0.22]));
            cr.moveTo(dX, cy - arrowH);
            cr.lineTo(dX, cy + arrowH);
            cr.moveTo(dX - headW, cy + arrowH - headH);
            cr.lineTo(dX, cy + arrowH);
            cr.lineTo(dX + headW, cy + arrowH - headH);
            cr.stroke();

            if (hasUp) {
                cr.newSubPath();
                cr.setLineWidth(arrowWidth + 2);
                cr.setLineCap(1);
                cr.setSourceRGBA(th.secondary[0], th.secondary[1], th.secondary[2], 0.20);
                cr.moveTo(uX, cy + arrowH);
                cr.lineTo(uX, cy - arrowH);
                cr.moveTo(uX - headW, cy - arrowH + headH);
                cr.lineTo(uX, cy - arrowH);
                cr.lineTo(uX + headW, cy - arrowH + headH);
                cr.stroke();
            }
            cr.newSubPath();
            cr.setLineWidth(arrowWidth);
            cr.setLineCap(1);
            cr.setSourceRGBA(...(hasUp ? th.secondary : [1.0, 1.0, 1.0, 0.22]));
            cr.moveTo(uX, cy + arrowH);
            cr.lineTo(uX, cy - arrowH);
            cr.moveTo(uX - headW, cy - arrowH + headH);
            cr.lineTo(uX, cy - arrowH);
            cr.lineTo(uX + headW, cy - arrowH + headH);
            cr.stroke();

            cr.newPath();

            const lStart = Math.PI / 2 + gap;
            const lEnd = (3 * Math.PI / 2) - gap;
            const lSweep = lEnd - lStart;
            const dProg = Math.min(1.0, Math.max(0.0, (this._percent || 0) / 100));
            const lProg = lStart + (lSweep * dProg);

            cr.newSubPath();
            cr.setLineWidth(arcWidth);
            cr.setLineCap(1);
            cr.setSourceRGBA(...th.track);
            cr.arc(cx, cy, dialR, lStart, lEnd);
            cr.stroke();

            if (dProg > 0.005) {
                cr.newSubPath();
                cr.setLineWidth(arcWidth + 4);
                cr.setLineCap(1);
                cr.setSourceRGBA(th.primary[0], th.primary[1], th.primary[2], 0.16);
                cr.arc(cx, cy, dialR, lStart, lProg);
                cr.stroke();

                cr.newSubPath();
                cr.setLineWidth(arcWidth);
                cr.setLineCap(1);
                cr.setSourceRGBA(...th.primary);
                cr.arc(cx, cy, dialR, lStart, lProg);
                cr.stroke();
            }

            const rStart = Math.PI / 2 - gap;
            const rEnd = -Math.PI / 2 + gap;
            const rSweep = rStart - rEnd;
            const uProg = Math.min(1.0, Math.max(0.0, (this._secondaryPercent || 0) / 100));
            const rProg = rStart - (rSweep * uProg);

            cr.newSubPath();
            cr.setLineWidth(arcWidth);
            cr.setLineCap(1);
            cr.setSourceRGBA(...th.track);
            cr.arcNegative(cx, cy, dialR, rStart, rEnd);
            cr.stroke();

            if (uProg > 0.005) {
                cr.newSubPath();
                cr.setLineWidth(arcWidth + 4);
                cr.setLineCap(1);
                cr.setSourceRGBA(th.secondary[0], th.secondary[1], th.secondary[2], 0.16);
                cr.arcNegative(cx, cy, dialR, rStart, rProg);
                cr.stroke();

                cr.newSubPath();
                cr.setLineWidth(arcWidth);
                cr.setLineCap(1);
                cr.setSourceRGBA(...th.secondary);
                cr.arcNegative(cx, cy, dialR, rStart, rProg);
                cr.stroke();
            }

        } else {
            cr.selectFontFace('Sans', 0, 1);
            cr.setFontSize(Math.round((this._compact ? 13 : 15) * this._scale));
            const pctText = `${Math.round(this._percent)}%`;
            const extents = cr.textExtents(pctText);
            cr.moveTo(cx - (extents.width / 2), cy + (extents.height / 2));

            const isHigh = this._percent > 85;
            const activeColor = isHigh ? th.coral : th.primary;

            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.95);
            cr.showText(pctText);

            cr.newPath();

            const mainR = maxR;
            drawArc(cr, cx, cy, mainR, 4, (this._percent / 100), th.track, activeColor);

            if (this._secondaryPercent > 0) {
                const swapR = maxR - 6;
                drawArc(cr, cx, cy, swapR, 2.5, (this._secondaryPercent / 100), th.track, th.secondary);
            }
        }

        cr.$dispose();
    }
});
