import Gio from 'gi://Gio';

export class DiskStat {
    constructor() {
        this._paths = ['/var/home', '/home', '/var', '/'];
    }

    sample() {
        let primaryStats = null;
        const candidatePaths = ['/var/home', '/home', '/var'];

        for (const p of candidatePaths) {
            const file = Gio.File.new_for_path(p);
            if (file.query_exists(null)) {
                const s = this._queryPath(p);
                if (parseFloat(s.totalGB) > 1.0) {
                    primaryStats = s;
                    break;
                }
            }
        }

        const rootStats = this._queryPath('/');

        const isAtomicComposefs = parseFloat(rootStats.totalGB) <= 1.0 && primaryStats;

        return {
            root: isAtomicComposefs ? primaryStats : rootStats,
            home: isAtomicComposefs ? null : primaryStats,
        };
    }

    _queryPath(path) {
        try {
            const file = Gio.File.new_for_path(path);
            const info = file.query_filesystem_info(
                `${Gio.FILE_ATTRIBUTE_FILESYSTEM_SIZE},${Gio.FILE_ATTRIBUTE_FILESYSTEM_FREE}`,
                null
            );

            if (info) {
                const totalBytes = info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_FILESYSTEM_SIZE);
                const freeBytes = info.get_attribute_uint64(Gio.FILE_ATTRIBUTE_FILESYSTEM_FREE);
                const usedBytes = Math.max(0, totalBytes - freeBytes);
                const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

                return {
                    path,
                    totalGB: (totalBytes / (1024 * 1024 * 1024)).toFixed(0),
                    freeGB: (freeBytes / (1024 * 1024 * 1024)).toFixed(0),
                    usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(0),
                    usedPercent,
                };
            }
        } catch (e) {
        }
        return {
            path,
            totalGB: '0',
            freeGB: '0',
            usedGB: '0',
            usedPercent: 0,
        };
    }
}
