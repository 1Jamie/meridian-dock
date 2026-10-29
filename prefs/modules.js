import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {DEFAULT_MODULE_ORDER} from '../src/common/moduleOrder.js';

export function addModulesPage(window, settings) {
    const modulesPage = new Adw.PreferencesPage({
        title: _('Modules'),
        icon_name: 'emblem-system-symbolic',
    });
    window.add(modulesPage);

    const hotkeysGroup = new Adw.PreferencesGroup({
        title: _('Shortcuts and Customization'),
    });
    modulesPage.add(hotkeysGroup);

    hotkeysGroup.add(new Adw.ActionRow({
        title: _('Toggle Dock Visibility'),
        subtitle: _('Press Super + C to show or hide the dock anytime'),
    }));
    hotkeysGroup.add(new Adw.ActionRow({
        title: _('In-Situ Dock Customizer'),
        subtitle: _('Press Shift + Super + E to reorder cards and adjust dock live on screen'),
    }));

    const resetRow = new Adw.ActionRow({
        title: _('Reset Module Order'),
        subtitle: _('Restore default module stacking sequence'),
    });
    const resetBtn = new Gtk.Button({
        label: _('Reset'),
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action'],
    });
    resetBtn.connect('clicked', () => {
        settings.set_strv('dock-modules', [...DEFAULT_MODULE_ORDER]);
        rebuildCardList();
    });
    resetRow.add_suffix(resetBtn);
    hotkeysGroup.add(resetRow);

    const modulesGroup = new Adw.PreferencesGroup({
        title: _('Module Sequence and Visibility'),
        description: _('Enable or disable telemetry modules and arrange their order with Up/Down buttons.'),
    });
    modulesPage.add(modulesGroup);

    const cardDefs = {
        clock: {
            title: _('Clock and Date Dial'),
            subtitle: _('Time, date, calendar progress, and system uptime'),
            key: 'show-clock',
        },
        cpu: {
            title: _('CPU Package Cluster'),
            subtitle: _('Package load, clock frequency, temperature, and multi-core sparkline'),
            key: 'show-cpu',
        },
        memory_storage: {
            title: _('Memory and Storage (Dual Gauge)'),
            subtitle: _('RAM utilization, swap load, and filesystem storage free space'),
            key: 'show-memory',
            dualKey: 'show-disk',
        },
        network: {
            title: _('Network Monitor'),
            subtitle: _('Dual upload and download throughput dials'),
            key: 'show-network',
        },
        processes: {
            title: _('Top Processes Tray'),
            subtitle: _('Expandable top resource-consuming processes'),
            key: 'show-processes',
        },
        connections: {
            title: _('Network Connections Tray'),
            subtitle: _('Expandable active established network sockets'),
            key: 'show-connections',
        },
    };

    const currentRows = [];
    const rebuildCardList = () => {
        for (const row of currentRows)
            modulesGroup.remove(row);
        currentRows.length = 0;

        const order = settings.get_strv('dock-modules');
        for (const key of Object.keys(cardDefs)) {
            if (!order.includes(key))
                order.push(key);
        }

        order.forEach((id, index) => {
            const def = cardDefs[id];
            if (!def)
                return;

            const row = new Adw.ActionRow({
                title: def.title,
                subtitle: def.subtitle,
            });
            const sw = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                active: settings.get_boolean(def.key),
            });
            sw.connect('notify::active', () => {
                settings.set_boolean(def.key, sw.active);
                if (def.dualKey)
                    settings.set_boolean(def.dualKey, sw.active);
            });
            row.add_prefix(sw);

            if (index > 0) {
                const upBtn = new Gtk.Button({
                    icon_name: 'go-up-symbolic',
                    valign: Gtk.Align.CENTER,
                    tooltip_text: _('Move Up'),
                });
                upBtn.connect('clicked', () => {
                    const newOrder = [...order];
                    const temp = newOrder[index - 1];
                    newOrder[index - 1] = newOrder[index];
                    newOrder[index] = temp;
                    settings.set_strv('dock-modules', newOrder);
                    rebuildCardList();
                });
                row.add_suffix(upBtn);
            }

            if (index < order.length - 1) {
                const downBtn = new Gtk.Button({
                    icon_name: 'go-down-symbolic',
                    valign: Gtk.Align.CENTER,
                    tooltip_text: _('Move Down'),
                });
                downBtn.connect('clicked', () => {
                    const newOrder = [...order];
                    const temp = newOrder[index + 1];
                    newOrder[index + 1] = newOrder[index];
                    newOrder[index] = temp;
                    settings.set_strv('dock-modules', newOrder);
                    rebuildCardList();
                });
                row.add_suffix(downBtn);
            }

            modulesGroup.add(row);
            currentRows.push(row);
        });
    };
    rebuildCardList();
}
