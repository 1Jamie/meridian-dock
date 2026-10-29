import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import {getTheme, drawArc, interpolateColor} from './Themes.js';

export const CpuDial = GObject.registerClass({
    GTypeName: 'PrimeCpuDial',
    Properties: {
        'interpolated_usage': GObject.ParamSpec.double(
            'interpolated_usage',
            'InterpolatedUsage',
            'Animated CPU total usage',
            GObject.ParamFlags.READWRITE,
            0.0, 100.0, 0.0
        ),
        'interpolated_temp': GObject.ParamSpec.double(
            'interpolated_temp',
            'InterpolatedTemp',
            'Animated CPU temperature',
            GObject.ParamFlags.READWRITE,
            0.0, 120.0, 0.0
        ),
    },
}, class CpuDial extends St.BoxLayout {
    get interpolated_usage() {
        return this._totalUsage;
    }

    set interpolated_usage(v) {
        if (Math.abs(this._totalUsage - v) > 0.02) {
            this._totalUsage = v;
            this._invalidateCanvas();
        }
    }

    get interpolated_temp() {
        return this._animTemp || 0;
    }

    set interpolated_temp(v) {
        if (Math.abs((this._animTemp || 0) - v) > 0.02) {
            this._animTemp = v;
            this._invalidateCanvas();
        }
    }

    _init(params = {}) {
        super._init({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'prime-card prime-cpu-card',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
            reactive: true,
            track_hover: true,
            can_focus: true,
        });

        this._theme = getTheme(params.theme || 'cyan');
        this._scale = params.scale || 1.0;
        this._enableInterpolation = params.enableInterpolation !== false;

        this._totalUsage = 0;
        this._cores = [];
        this._freqMHz = null;
        this._tempC = null;
        this._model = 'CPU';
        this._tempUnit = 'c';
        this._showDetailView = false;
        this._isEditMode = false;

        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() === 3 && !this._isEditMode) {
                this._showDetailView = !this._showDetailView;
                this._updateLabels();
                this._invalidateCanvas();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        const canvasSize = Math.round(88 * this._scale);

        this._canvas = new St.DrawingArea({
            width: canvasSize,
            height: canvasSize,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._canvas.connect('repaint', this._onRepaintDial.bind(this));
        this.add_child(this._canvas);

        const infoBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'prime-cpu-info-box',
            x_expand: true,
        });

        this._headerLabel = new St.Label({
            text: 'CPU CLUSTER',
            style_class: 'prime-card-header',
            x_expand: true,
        });
        this._headerLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._headerLabel.clutter_text.line_wrap = false;

        this._modelLabel = new St.Label({
            text: '...',
            style_class: 'prime-dim-label',
            x_expand: true,
        });
        this._modelLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        this._statLabel = new St.Label({
            text: '-- MHz  |  --°C',
            style_class: 'prime-metric-sub',
            x_expand: true,
        });
        this._statLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._statLabel.clutter_text.line_wrap = false;

        this._sparkline = new St.DrawingArea({
            height: 14,
            style_class: 'prime-cpu-sparkline',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._sparkline.connect('repaint', this._onRepaintSparkline.bind(this));

        infoBox.add_child(this._headerLabel);
        infoBox.add_child(this._modelLabel);
        infoBox.add_child(this._statLabel);
        infoBox.add_child(this._sparkline);
        this.add_child(infoBox);
    }

    setEditMode(enabled) {
        this._isEditMode = !!enabled;
    }

    setTheme(themeName) {
        this._theme = getTheme(themeName);
        this._canvas.queue_repaint();
        this._sparkline.queue_repaint();
    }

    setScale(scale) {
        this._scale = scale;
        const size = Math.round(88 * scale);
        this._canvas.set_size(size, size);
        this._canvas.queue_repaint();
        this._sparkline.queue_repaint();
    }

    setTempUnit(unit) {
        this._tempUnit = unit || 'c';
        this._updateLabels();
    }

    setInterpolation(enabled) {
        this._enableInterpolation = !!enabled;
    }

    _invalidateCanvas() {
        this._canvas.queue_repaint();
        this._sparkline.queue_repaint();
    }

    updateData(data) {
        const rawUsage = data.totalUsage ?? data.totalPercent ?? 0;
        const targetUsage = Math.min(100, Math.max(0, rawUsage));
        const targetTemp = Math.min(120, Math.max(0, data.temperatureC ?? 0));

        this._cores = data.cores || [];
        this._freqMHz = data.frequencyMHz;
        this._model = data.model || 'CPU';
        this._tempC = (data.temperatureC !== null && data.temperatureC !== undefined) ? data.temperatureC : null;

        this._updateLabels();

        if (this._enableInterpolation) {
            const isRampingUp = targetUsage > this._totalUsage;
            const duration = isRampingUp ? 180 : 650;
            const mode = isRampingUp
                ? Clutter.AnimationMode.EASE_OUT_QUAD
                : Clutter.AnimationMode.EASE_OUT_CUBIC;

            this.remove_transition('interpolated_usage');
            this.ease_property('interpolated_usage', targetUsage, {
                duration,
                mode,
            });

            if (Math.abs((this._animTemp || 0) - targetTemp) > 0.1) {
                this.remove_transition('interpolated_temp');
                this.ease_property('interpolated_temp', targetTemp, {
                    duration: 650,
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            }
        } else {
            this._totalUsage = targetUsage;
            this._animTemp = targetTemp;
            this._invalidateCanvas();
        }
    }

    _updateLabels() {
        if (this._modelLabel) {
            if (this._showDetailView && this._cores.length > 0) {
                this._modelLabel.set_text(`${this._cores.length} CORES ACTIVE`);
            } else {
                this._modelLabel.set_text(this._model.substring(0, 24));
            }
        }

        const freqStr = this._freqMHz ? (this._freqMHz >= 1000 ? `${(this._freqMHz / 1000).toFixed(1)} GHz` : `${this._freqMHz} MHz`) : '--';
        let tempStr = '--';
        if (this._tempC !== null && this._tempC !== undefined) {
            if (this._tempUnit === 'f') {
                const tempF = Math.round((this._tempC * 9 / 5) + 32);
                tempStr = `${tempF}°F`;
            } else {
                tempStr = `${Math.round(this._tempC)}°C`;
            }
        }
        this._statLabel.set_text(`${freqStr}  |  ${tempStr}`);
    }

    _onRepaintDial(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const cx = w / 2;
        const cy = h / 2;
        const maxR = (Math.min(w, h) / 2) - 4;
        const th = this._theme;

        cr.selectFontFace('Sans', 0, 1);
        cr.setFontSize(Math.round(15 * this._scale));
        const pctText = `${Math.round(this._totalUsage)}%`;
        const extents = cr.textExtents(pctText);
        cr.moveTo(cx - (extents.width / 2), cy + (extents.height / 2) - 4);
        cr.setSourceRGBA(1.0, 1.0, 1.0, 0.95);
        cr.showText(pctText);

        cr.setFontSize(Math.round(8.5 * this._scale));
        const subText = 'CPU';
        const subExtents = cr.textExtents(subText);
        cr.moveTo(cx - (subExtents.width / 2), cy + (extents.height / 2) + 9);
        cr.setSourceRGBA(...th.primary);
        cr.showText(subText);

        cr.newPath();

        const outerR = maxR;
        const totalProg = this._totalUsage / 100;
        drawArc(cr, cx, cy, outerR, 4, totalProg, th.track, th.primary);

        const innerR = maxR - 7;
        const tempVal = (this._animTemp > 0) ? this._animTemp : (this._tempC !== null ? this._tempC : 45);
        const heatFactor = Math.min(1.0, Math.max(0.0, (tempVal - 35) / 50));
        const tempColor = interpolateColor(th.primary, th.coral, heatFactor);
        const tempProg = Math.min(1.0, Math.max(0.0, tempVal / 100));

        drawArc(cr, cx, cy, innerR, 3, tempProg, th.track, tempColor);

        cr.$dispose();
    }

    _onRepaintSparkline(area) {
        const cr = area.get_context();
        const [w, h] = area.get_surface_size();
        const count = this._cores.length || 16;
        const gap = 2;
        const totalGap = gap * (count - 1);
        const barWidth = Math.max(2, Math.floor((w - totalGap) / count));
        const th = this._theme;

        for (let i = 0; i < count; i++) {
            const core = this._cores[i] || { usage: 0 };
            const x = i * (barWidth + gap);
            const usage = Math.min(100, Math.max(0, core.usage));

            cr.newSubPath();
            cr.setSourceRGBA(1.0, 1.0, 1.0, 0.08);
            cr.rectangle(x, 1, barWidth, h - 2);
            cr.fill();

            const barHeight = Math.max(2, Math.round(((h - 2) * usage) / 100));
            const y = h - 1 - barHeight;

            cr.newSubPath();
            if (usage > 80) {
                cr.setSourceRGBA(...th.coral);
            } else if (usage > 50) {
                cr.setSourceRGBA(...th.secondary);
            } else {
                cr.setSourceRGBA(...th.primary);
            }
            cr.rectangle(x, y, barWidth, barHeight);
            cr.fill();
        }

        cr.$dispose();
    }
});
