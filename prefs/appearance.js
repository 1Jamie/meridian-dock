import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addAppearancePage(window, settings) {
    const stylePage = new Adw.PreferencesPage({
        title: _('Aesthetics'),
        icon_name: 'applications-graphics-symbolic',
    });
    window.add(stylePage);

    const visualGroup = new Adw.PreferencesGroup({
        title: _('Color and Dial Aesthetics'),
    });
    stylePage.add(visualGroup);

    const themeList = [_('Cyan'), _('White'), _('Amber'), _('Green')];
    const themeKeys = ['cyan', 'white', 'amber', 'green'];
    const themeRow = new Adw.ComboRow({
        title: _('Accent Color Theme'),
        subtitle: _('Color scheme for glowing indicators and vector rings'),
        model: Gtk.StringList.new(themeList),
        selected: Math.max(0, themeKeys.indexOf(settings.get_string('theme'))),
    });
    themeRow.connect('notify::selected', () => {
        settings.set_string('theme', themeKeys[themeRow.selected]);
    });
    visualGroup.add(themeRow);

    const clockStyleList = [_('Concentric Rings'), _('Analog Dial'), _('Digital Display')];
    const clockStyleKeys = ['concentric', 'analog', 'digital'];
    const clockStyleRow = new Adw.ComboRow({
        title: _('Clock Dial Style'),
        subtitle: _('Concentric time arcs, modern analog hands, or digital text'),
        model: Gtk.StringList.new(clockStyleList),
        selected: Math.max(0, clockStyleKeys.indexOf(settings.get_string('clock-style'))),
    });
    clockStyleRow.connect('notify::selected', () => {
        settings.set_string('clock-style', clockStyleKeys[clockStyleRow.selected]);
    });
    visualGroup.add(clockStyleRow);

    const tempRow = new Adw.ComboRow({
        title: _('Temperature Unit'),
        subtitle: _('Unit of measurement for CPU core thermal sensor'),
        model: Gtk.StringList.new([_('Celsius (°C)'), _('Fahrenheit (°F)')]),
        selected: settings.get_string('temp-unit') === 'f' ? 1 : 0,
    });
    tempRow.connect('notify::selected', () => {
        settings.set_string('temp-unit', tempRow.selected === 1 ? 'f' : 'c');
    });
    visualGroup.add(tempRow);

    const interpRow = new Adw.SwitchRow({
        title: _('Smooth Dial Interpolation'),
        subtitle: _('Hardware-timed easing with rapid spike response and gradual decay'),
    });
    settings.bind('enable-interpolation', interpRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    visualGroup.add(interpRow);

    const updateIntervalRow = new Adw.SpinRow({
        title: _('Update Interval (Seconds)'),
        subtitle: _('Telemetry polling rate for CPU, memory, network, and storage'),
        adjustment: new Gtk.Adjustment({
            lower: 1,
            upper: 10,
            step_increment: 1,
            value: settings.get_int('update-interval'),
        }),
    });
    settings.bind('update-interval', updateIntervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    visualGroup.add(updateIntervalRow);
}
