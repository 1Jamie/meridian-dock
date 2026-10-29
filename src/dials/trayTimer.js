import GLib from 'gi://GLib';

export function armTimeout(currentId, seconds, callback) {
    if (currentId) {
        GLib.Source.remove(currentId);
    }
    return GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, callback);
}
