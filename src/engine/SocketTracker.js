import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const WELL_KNOWN_PORTS = {
    21: 'FTP',
    22: 'SSH',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    123: 'NTP',
    443: 'HTTPS',
    631: 'CUPS',
    993: 'IMAPS',
    1337: 'DEV/1337',
    3000: 'DEV/3000',
    3306: 'MYSQL',
    5173: 'DEV/VITE',
    5432: 'PGSQL',
    6379: 'REDIS',
    8000: 'DEV/8000',
    8080: 'DEV/8080',
    8443: 'HTTPS-ALT',
    9000: 'DEV/9000',
    11434: 'OLLAMA',
    27017: 'MONGODB',
};

const PROC_SCAN_INTERVAL_MS = 20000;

function readText(path) {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
        return '';
    return new TextDecoder().decode(bytes);
}

export class SocketTracker {
    constructor() {
        this._cachedEstab = [];
        this._cachedListen = [];
        this._inodeToComm = new Map();
        this._lastProcScan = 0;
    }

    _formatAddress(hex, port) {
        if (hex.length === 8) {
            const value = parseInt(hex, 16);
            const b1 = value & 0xff;
            const b2 = (value >> 8) & 0xff;
            const b3 = (value >> 16) & 0xff;
            const b4 = (value >> 24) & 0xff;
            return `${b1}.${b2}.${b3}.${b4}:${port}`;
        }

        if (hex.length !== 32)
            return `*:${port}`;
        if (/^0+$/.test(hex))
            return `*:${port}`;

        const bytes = [];
        for (let i = 0; i < 4; i++) {
            const word = parseInt(hex.substring(i * 8, i * 8 + 8), 16);
            bytes.push(word & 0xff, (word >> 8) & 0xff, (word >> 16) & 0xff, (word >> 24) & 0xff);
        }

        const mapped = bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
        if (mapped)
            return `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}:${port}`;

        const parts = [];
        for (let i = 0; i < 16; i += 2)
            parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
        return `[${parts.join(':')}]:${port}`;
    }

    _portOf(endpoint) {
        if (!endpoint)
            return '';
        const mark = endpoint.lastIndexOf(':');
        return mark === -1 ? endpoint : endpoint.substring(mark + 1);
    }

    _refreshInodes() {
        const now = Date.now();
        if (this._lastProcScan && (now - this._lastProcScan) < PROC_SCAN_INTERVAL_MS)
            return;

        this._lastProcScan = now;
        const map = new Map();
        let enumerator;
        try {
            enumerator = Gio.File.new_for_path('/proc').enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                null
            );
        } catch (e) {
            this._inodeToComm = map;
            return;
        }

        let info = enumerator.next_file(null);
        while (info) {
            const name = info.get_name();
            info = enumerator.next_file(null);
            if (!/^[0-9]+$/.test(name))
                continue;

            let comm = '';
            try {
                comm = readText(`/proc/${name}/comm`).trim();
            } catch (e) {
                continue;
            }
            if (!comm)
                continue;

            let fds;
            try {
                fds = Gio.File.new_for_path(`/proc/${name}/fd`).enumerate_children(
                    Gio.FILE_ATTRIBUTE_STANDARD_SYMLINK_TARGET,
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    null
                );
            } catch (e) {
                continue;
            }

            let fdInfo = fds.next_file(null);
            while (fdInfo) {
                if (fdInfo.has_attribute(Gio.FILE_ATTRIBUTE_STANDARD_SYMLINK_TARGET)) {
                    const target = fdInfo.get_symlink_target();
                    const match = target ? /^socket:\[(\d+)\]$/.exec(target) : null;
                    if (match)
                        map.set(match[1], comm);
                }
                fdInfo = fds.next_file(null);
            }
            fds.close(null);
        }
        enumerator.close(null);
        this._inodeToComm = map;
    }

    _readTable(path, mode) {
        const targetState = mode === 'listen' ? '0A' : '01';
        let text = '';
        try {
            text = readText(path);
        } catch (e) {
            return [];
        }

        const rows = [];
        const lines = text.split('\n');
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            const parts = line.split(/\s+/);
            if (parts[3] !== targetState)
                continue;

            const localHex = parts[1].split(':');
            const remoteHex = parts[2].split(':');
            const localPort = parseInt(localHex[1], 16);
            const remotePort = parseInt(remoteHex[1], 16);
            rows.push({
                local: this._formatAddress(localHex[0], localPort),
                remote: this._formatAddress(remoteHex[0], remotePort),
                localPort: String(localPort),
                remotePort: String(remotePort),
                inode: parts[9] || '',
            });
        }
        return rows;
    }

    _connections(mode) {
        this._refreshInodes();
        return [
            ...this._readTable('/proc/net/tcp', mode),
            ...this._readTable('/proc/net/tcp6', mode),
        ];
    }

    _procFor(row) {
        return this._inodeToComm.get(row.inode) || '';
    }

    sampleEstablished(limit = 6) {
        const results = [];
        for (const row of this._connections('estab')) {
            const proc = this._procFor(row);
            const alias = WELL_KNOWN_PORTS[row.remotePort] || '';
            results.push({
                local: row.local,
                remote: row.remote,
                proc,
                port: row.remotePort,
                alias,
                display: proc ? `${proc} -> ${row.remote}` : row.remote,
                state: alias || 'ESTAB',
            });
            if (results.length >= limit)
                break;
        }
        this._cachedEstab = results;
        return results;
    }

    sampleListening(limit = 6) {
        const listeners = [];
        const seen = new Set();
        for (const row of this._connections('listen')) {
            const port = row.localPort;
            if (!port || port === '0' || seen.has(port))
                continue;
            seen.add(port);
            const proc = this._procFor(row);
            const alias = WELL_KNOWN_PORTS[port] || '';
            const label = proc ? (alias ? `${proc} (${alias})` : proc) : (alias || 'LISTEN');
            listeners.push({
                port: `:${port}`,
                rawPort: port,
                local: row.local,
                proc,
                alias,
                display: `:${port}   ${label}`,
                state: 'LISTEN',
            });
        }

        listeners.sort((a, b) => {
            const rank = item => (WELL_KNOWN_PORTS[item.rawPort] ? 2 : 0) + (parseInt(item.rawPort, 10) < 32768 ? 1 : 0);
            const delta = rank(b) - rank(a);
            if (delta !== 0)
                return delta;
            return parseInt(a.rawPort, 10) - parseInt(b.rawPort, 10);
        });
        this._cachedListen = listeners.slice(0, limit);
        return this._cachedListen;
    }

    sampleEstablishedAsync(limit = 6) {
        return Promise.resolve(this.sampleEstablished(limit));
    }

    sampleListeningAsync(limit = 6) {
        return Promise.resolve(this.sampleListening(limit));
    }

    sampleAsync(mode = 'estab', limit = 6) {
        if (mode === 'listen')
            return this.sampleListeningAsync(limit);
        return this.sampleEstablishedAsync(limit);
    }
}
