import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addTopBarPage(window, settings) {
    const topbarPage = new Adw.PreferencesPage({
        title: _('Top Bar'),
        icon_name: 'pan-down-symbolic',
    });
    window.add(topbarPage);

    const topbarGroup = new Adw.PreferencesGroup({
        title: _('Top Bar Companion Pill'),
        description: _('Glanceable telemetry companion badge in the GNOME panel.'),
    });
    topbarPage.add(topbarGroup);

    const pillRow = new Adw.SwitchRow({
        title: _('Show Top Bar Pill'),
        subtitle: _('Show real-time micro-metrics in GNOME top panel'),
    });
    settings.bind('topbar-show-pill', pillRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    topbarGroup.add(pillRow);

    const alertThresholdRow = new Adw.SpinRow({
        title: _('Alert Threshold (%)'),
        subtitle: _('CPU or RAM percent that shifts top bar indicator to alert red'),
        adjustment: new Gtk.Adjustment({
            lower: 50,
            upper: 99,
            step_increment: 5,
            value: settings.get_int('topbar-alert-threshold'),
        }),
    });
    settings.bind('topbar-alert-threshold', alertThresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    topbarGroup.add(alertThresholdRow);

    const topbarMetricsGroup = new Adw.PreferencesGroup({
        title: _('Pill Displayed Metrics'),
        description: _('Select which metrics appear inside the top bar pill.'),
    });
    topbarPage.add(topbarMetricsGroup);

    const metricsList = [
        {id: 'cpu', label: _('CPU Usage'), sub: _('Show CPU percentage in top bar')},
        {id: 'ram', label: _('RAM Usage'), sub: _('Show RAM percentage in top bar')},
        {id: 'temp', label: _('Package Temperature'), sub: _('Show CPU thermal reading in top bar')},
        {id: 'net', label: _('Network Speeds'), sub: _('Show live download and upload speeds')},
    ];
    for (const metric of metricsList) {
        const row = new Adw.SwitchRow({
            title: metric.label,
            subtitle: metric.sub,
            active: settings.get_strv('topbar-metrics').includes(metric.id),
        });
        row.connect('notify::active', () => {
            let current = settings.get_strv('topbar-metrics');
            if (row.active) {
                if (!current.includes(metric.id))
                    current.push(metric.id);
            } else {
                current = current.filter(id => id !== metric.id);
            }
            settings.set_strv('topbar-metrics', current);
        });
        topbarMetricsGroup.add(row);
    }
}
