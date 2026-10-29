import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const CLOCK_TICKS = 100;
const PAGE_SIZE = 4096;

function normalizeComm(comm) {
    if (comm === 'Web Content' || comm === 'Isolated Web Co' || comm === 'RDD Process' || comm === 'Socket Process')
        return 'firefox';
    if (comm === 'chrome-sandbox' || comm === 'chrome_crashpad')
        return 'chrome';
    return comm;
}

function parseStat(text) {
    const open = text.indexOf('(');
    const close = text.lastIndexOf(')');
    if (open < 1 || close < open)
        return null;

    const pid = parseInt(text.substring(0, open).trim(), 10);
    const comm = text.substring(open + 1, close);
    const fields = text.substring(close + 2).trim().split(/\s+/);
    if (fields.length < 22 || Number.isNaN(pid) || !comm)
        return null;

    return {
        pid,
        comm,
        ppid: parseInt(fields[1], 10) || 0,
        utime: parseInt(fields[11], 10) || 0,
        stime: parseInt(fields[12], 10) || 0,
        rssPages: parseInt(fields[21], 10) || 0,
    };
}

export class ProcessTracker {
    constructor() {
        this._allGroups = [];
        this._prevTicks = new Map();
    }

    _sortAndSlice(groups, limit, sortBy) {
        if (!groups || groups.length === 0)
            return [];
        const copy = [...groups];
        if (sortBy === 'mem') {
            copy.sort((a, b) => {
                if (b.rssKb !== a.rssKb)
                    return b.rssKb - a.rssKb;
                return b.cpu - a.cpu;
            });
        } else {
            copy.sort((a, b) => {
                if (b.cpu !== a.cpu)
                    return b.cpu - a.cpu;
                return b.rssKb - a.rssKb;
            });
        }
        return copy.slice(0, limit);
    }

    _listPids() {
        const enumerator = Gio.File.new_for_path('/proc').enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        const pids = [];
        let info = enumerator.next_file(null);
        while (info) {
            const name = info.get_name();
            if (/^[0-9]+$/.test(name))
                pids.push(name);
            info = enumerator.next_file(null);
        }
        enumerator.close(null);
        return pids;
    }

    _readProcTable() {
        const now = GLib.get_monotonic_time() / 1000000;
        const seen = new Set();
        const procs = [];

        for (const pidStr of this._listPids()) {
            let text = null;
            try {
                const [ok, bytes] = GLib.file_get_contents(`/proc/${pidStr}/stat`);
                if (ok)
                    text = new TextDecoder().decode(bytes);
            } catch (e) {
                continue;
            }
            if (!text)
                continue;

            const parsed = parseStat(text);
            if (!parsed)
                continue;

            seen.add(parsed.pid);
            const ticks = parsed.utime + parsed.stime;
            let cpu = 0;
            const prev = this._prevTicks.get(parsed.pid);
            if (prev && now > prev.time && ticks >= prev.ticks) {
                const deltaSec = now - prev.time;
                if (deltaSec > 0)
                    cpu = ((ticks - prev.ticks) / CLOCK_TICKS) / deltaSec * 100;
            }
            this._prevTicks.set(parsed.pid, {ticks, time: now});
            procs.push({
                pid: parsed.pid,
                ppid: parsed.ppid,
                cpu,
                rssKb: Math.round((parsed.rssPages * PAGE_SIZE) / 1024),
                comm: parsed.comm,
            });
        }

        for (const pid of this._prevTicks.keys()) {
            if (!seen.has(pid))
                this._prevTicks.delete(pid);
        }
        return procs;
    }

    _aggregate(procs) {
        const procMap = new Map();
        for (const proc of procs) {
            if (!proc.comm)
                continue;
            procMap.set(proc.pid, proc);
        }

        const groups = new Map();
        for (const proc of procMap.values()) {
            const key = normalizeComm(proc.comm);
            if (!groups.has(key)) {
                groups.set(key, {
                    name: key,
                    pid: proc.pid,
                    pids: [],
                    count: 0,
                    cpu: 0,
                    rssKb: 0,
                });
            }
            const group = groups.get(key);
            group.count++;
            group.cpu += proc.cpu;
            group.rssKb += proc.rssKb;
            group.pids.push(proc.pid);
        }

        for (const group of groups.values()) {
            const pids = new Set(group.pids);
            const roots = group.pids.filter(id => {
                const proc = procMap.get(id);
                return proc && !pids.has(proc.ppid);
            });
            if (roots.length > 0) {
                roots.sort((a, b) => a - b);
                group.pid = roots[0];
            }
        }

        return [...groups.values()].map(group => ({
            pid: group.pid,
            pids: group.pids,
            name: group.name,
            count: group.count,
            cpu: Math.round(group.cpu * 10) / 10,
            memMB: Math.round(group.rssKb / 1024),
            rssKb: group.rssKb,
        }));
    }

    sampleTopProcesses(limit = 6, sortBy = 'cpu') {
        try {
            this._allGroups = this._aggregate(this._readProcTable());
        } catch (e) {
            return this._sortAndSlice(this._allGroups, limit, sortBy);
        }
        return this._sortAndSlice(this._allGroups, limit, sortBy);
    }

    sampleTopProcessesAsync(limit = 6, sortBy = 'cpu') {
        return Promise.resolve(this.sampleTopProcesses(limit, sortBy));
    }
}
