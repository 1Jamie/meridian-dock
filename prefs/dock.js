import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export function addDockPage(window, settings) {
    const signalIds = [];
    const dockPage = new Adw.PreferencesPage({
        title: _('Dock'),
        icon_name: 'preferences-desktop-display-symbolic',
    });
    window.add(dockPage);

    const placementGroup = new Adw.PreferencesGroup({
        title: _('Placement and Screen'),
        description: _('Configure which monitor and screen edge the telemetry dock occupies.'),
    });
    dockPage.add(placementGroup);

    const monitorItems = [_('Primary Display')];
    const gdkDisplay = Gdk.Display.get_default();
    const monitors = gdkDisplay ? gdkDisplay.get_monitors() : null;
    const nMonitors = monitors ? monitors.get_n_items() : 0;
    for (let i = 0; i < nMonitors; i++) {
        const mon = monitors.get_item(i);
        let desc = mon.get_description() || mon.get_model() || `Display ${i + 1}`;
        if (desc.length > 22)
            desc = `${desc.substring(0, 20)}…`;
        monitorItems.push(`Display ${i + 1} (${desc})`);
    }

    const currentMonIdx = settings.get_int('monitor-index');
    let selectedMonPos = 0;
    if (currentMonIdx >= 0 && currentMonIdx < nMonitors)
        selectedMonPos = currentMonIdx + 1;

    const monitorRow = new Adw.ComboRow({
        title: _('Target Monitor'),
        subtitle: _('Select screen where the dock is rendered'),
        model: Gtk.StringList.new(monitorItems),
        selected: selectedMonPos,
    });
    monitorRow.connect('notify::selected', () => {
        const sel = monitorRow.selected;
        settings.set_int('monitor-index', sel === 0 ? -1 : sel - 1);
    });
    placementGroup.add(monitorRow);

    const edgeList = [_('Right'), _('Left'), _('Top'), _('Bottom')];
    const edgeKeys = ['right', 'left', 'top', 'bottom'];
    const curEdge = settings.get_string('dock-position');
    const edgeRow = new Adw.ComboRow({
        title: _('Screen Edge'),
        subtitle: _('Anchor dock to screen edge with automatic reflow'),
        model: Gtk.StringList.new(edgeList),
        selected: Math.max(0, edgeKeys.indexOf(curEdge)),
    });
    edgeRow.connect('notify::selected', () => {
        settings.set_string('dock-position', edgeKeys[edgeRow.selected]);
    });
    placementGroup.add(edgeRow);

    const spanList = [_('Full Edge'), _('Floating Island')];
    const spanKeys = ['fill', 'compact'];
    const curSpan = settings.get_string('dock-length-mode');
    const spanRow = new Adw.ComboRow({
        title: _('Dock Length Mode'),
        subtitle: _('Edge-to-edge strut reservation or floating compact dock'),
        model: Gtk.StringList.new(spanList),
        selected: Math.max(0, spanKeys.indexOf(curSpan)),
    });
    placementGroup.add(spanRow);

    const alignList = [_('Center'), _('Start'), _('End')];
    const alignKeys = ['center', 'start', 'end'];
    const curAlign = settings.get_string('dock-alignment');
    const alignRow = new Adw.ComboRow({
        title: _('Floating Alignment'),
        subtitle: _('Position along the edge in Floating Island mode'),
        model: Gtk.StringList.new(alignList),
        selected: Math.max(0, alignKeys.indexOf(curAlign)),
    });
    alignRow.connect('notify::selected', () => {
        settings.set_string('dock-alignment', alignKeys[alignRow.selected]);
    });
    placementGroup.add(alignRow);

    const strutsRow = new Adw.SwitchRow({
        title: _('Reserve Screen Space (Struts)'),
        subtitle: _('Prevent maximized windows from overlapping the dock'),
    });
    settings.bind('dock-affects-struts', strutsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    placementGroup.add(strutsRow);

    const updateSpanSensitivity = () => {
        const isFull = settings.get_string('dock-length-mode') === 'fill';
        strutsRow.set_sensitive(isFull);
        strutsRow.set_subtitle(isFull
            ? _('Prevent maximized windows from overlapping the dock')
            : _('Disabled in Floating Island mode'));
        alignRow.set_sensitive(!isFull);
    };
    spanRow.connect('notify::selected', () => {
        settings.set_string('dock-length-mode', spanKeys[spanRow.selected]);
        updateSpanSensitivity();
    });
    signalIds.push(settings.connect('changed::dock-length-mode', () => {
        const mode = settings.get_string('dock-length-mode');
        const idx = spanKeys.indexOf(mode);
        if (idx >= 0 && spanRow.selected !== idx)
            spanRow.selected = idx;
        updateSpanSensitivity();
    }));
    updateSpanSensitivity();

    const spreadRow = new Adw.SwitchRow({
        title: _('Show in Overview'),
        subtitle: _('Keep dock visible when pressing Super to view windows'),
    });
    settings.bind('show-in-overview', spreadRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    placementGroup.add(spreadRow);

    const sizeGroup = new Adw.PreferencesGroup({
        title: _('Dimensions and Styling'),
    });
    dockPage.add(sizeGroup);

    const thickRow = new Adw.SpinRow({
        title: _('Dock Thickness (px)'),
        subtitle: _('Width for vertical dock or height for horizontal dock'),
        adjustment: new Gtk.Adjustment({
            lower: 200,
            upper: 480,
            step_increment: 10,
            value: settings.get_int('dock-thickness'),
        }),
    });
    settings.bind('dock-thickness', thickRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    sizeGroup.add(thickRow);

    const marginRow = new Adw.SpinRow({
        title: _('Edge Margin (px)'),
        subtitle: _('Offset from monitor edge in pixels'),
        adjustment: new Gtk.Adjustment({
            lower: 0,
            upper: 60,
            step_increment: 2,
            value: settings.get_int('dock-margin'),
        }),
    });
    settings.bind('dock-margin', marginRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    sizeGroup.add(marginRow);

    const radiusRow = new Adw.SpinRow({
        title: _('Corner Radius (px)'),
        subtitle: _('Curvature of the dock and card borders'),
        adjustment: new Gtk.Adjustment({
            lower: 4,
            upper: 32,
            step_increment: 2,
            value: settings.get_int('dock-corner-radius'),
        }),
    });
    settings.bind('dock-corner-radius', radiusRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    sizeGroup.add(radiusRow);

    const dockOpacityRow = new Adw.SpinRow({
        title: _('Dock Background Opacity (%)'),
        subtitle: _('Translucency of dock container (0 = transparent, 100 = solid)'),
        adjustment: new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 5,
            value: settings.get_int('dock-opacity'),
        }),
    });
    settings.bind('dock-opacity', dockOpacityRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    sizeGroup.add(dockOpacityRow);

    const cardOpacityRow = new Adw.SpinRow({
        title: _('Card Background Opacity (%)'),
        subtitle: _('Translucency of module cards inside the dock'),
        adjustment: new Gtk.Adjustment({
            lower: 0,
            upper: 100,
            step_increment: 5,
            value: settings.get_int('card-opacity'),
        }),
    });
    settings.bind('card-opacity', cardOpacityRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    sizeGroup.add(cardOpacityRow);

    const scaleRow = new Adw.SpinRow({
        title: _('UI Scale Factor'),
        subtitle: _('Scale size of vector dials and text'),
        digits: 2,
        adjustment: new Gtk.Adjustment({
            lower: 0.75,
            upper: 1.50,
            step_increment: 0.05,
            value: settings.get_double('scale-factor'),
        }),
    });
    settings.bind('scale-factor', scaleRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    sizeGroup.add(scaleRow);

    window.connect('destroy', () => {
        for (const id of signalIds)
            settings.disconnect(id);
    });
}
