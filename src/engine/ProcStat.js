import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class ProcStat {
    constructor() {
        this._prevTotal = 0;
        this._prevIdle = 0;
        this._prevCores = new Map();
        this._hwmonTempPath = null;
        this._findTempSensor();
    }

    _findTempSensor() {
        try {
            for (let i = 0; i < 8; i++) {
                const dirPath = `/sys/class/hwmon/hwmon${i}`;
                const nameFile = Gio.File.new_for_path(`${dirPath}/name`);
                if (nameFile.query_exists(null)) {
                    const [ok, bytes] = GLib.file_get_contents(`${dirPath}/name`);
                    if (ok) {
                        const name = new TextDecoder().decode(bytes).trim();
                        if (name.includes('coretemp') || name.includes('k10temp') || name.includes('zenpower') || name.includes('cpu')) {
                            for (let t = 1; t <= 3; t++) {
                                const tempFile = Gio.File.new_for_path(`${dirPath}/temp${t}_input`);
                                if (tempFile.query_exists(null)) {
                                    this._hwmonTempPath = `${dirPath}/temp${t}_input`;
                                    return;
                                }
                            }
                        }
                    }
                }
            }
            const thermalFile = Gio.File.new_for_path('/sys/class/thermal/thermal_zone0/temp');
            if (thermalFile.query_exists(null)) {
                this._hwmonTempPath = '/sys/class/thermal/thermal_zone0/temp';
            }
        } catch (e) {
        }
    }

    getTemperature() {
        if (!this._hwmonTempPath) return null;
        try {
            const [ok, bytes] = GLib.file_get_contents(this._hwmonTempPath);
            if (ok) {
                const raw = parseInt(new TextDecoder().decode(bytes).trim(), 10);
                return Math.round(raw / 1000);
            }
        } catch (e) {
        }
        return null;
    }

    getCpuFrequency() {
        try {
            const freqFile = Gio.File.new_for_path('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq');
            if (freqFile.query_exists(null)) {
                const [ok, bytes] = GLib.file_get_contents('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq');
                if (ok) {
                    const khz = parseInt(new TextDecoder().decode(bytes).trim(), 10);
                    return Math.round(khz / 1000);
                }
            }

            const [ok, bytes] = GLib.file_get_contents('/proc/cpuinfo');
            if (ok) {
                const text = new TextDecoder().decode(bytes);
                const match = text.match(/cpu MHz\s*:\s*([\d.]+)/);
                if (match) {
                    return Math.round(parseFloat(match[1]));
                }
            }
        } catch (e) {
        }
        return null;
    }

    getCpuModel() {
        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/cpuinfo');
            if (ok) {
                const text = new TextDecoder().decode(bytes);
                const match = text.match(/model name\s*:\s*(.+)/);
                if (match) {
                    return match[1].trim()
                        .replace(/\(R\)|\(TM\)|Processor|CPU/gi, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                }
            }
        } catch (e) {
        }
        return 'CPU';
    }

    getUptime() {
        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/uptime');
            if (ok) {
                const totalSeconds = Math.floor(parseFloat(new TextDecoder().decode(bytes).split(' ')[0]));
                const days = Math.floor(totalSeconds / 86400);
                const hours = Math.floor((totalSeconds % 86400) / 3600);
                const mins = Math.floor((totalSeconds % 3600) / 60);
                if (days > 0) {
                    return `${days}d ${hours}h ${mins}m`;
                }
                return `${hours}h ${mins}m`;
            }
        } catch (e) {
        }
        return '--';
    }

    sampleCpu() {
        let totalUsage = 0;
        const cores = [];
        let totalProcesses = 0;
        let runningProcesses = 0;

        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/stat');
            if (!ok) return { totalUsage: 0, cores: [], totalProcesses: 0, runningProcesses: 0 };

            const text = new TextDecoder().decode(bytes);
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('cpu ')) {
                    const parts = line.trim().split(/\s+/).slice(1).map(Number);
                    const idle = parts[3] + (parts[4] || 0);
                    const nonIdle = parts[0] + parts[1] + parts[2] + (parts[5] || 0) + (parts[6] || 0) + (parts[7] || 0);
                    const total = idle + nonIdle;

                    const totalDelta = total - this._prevTotal;
                    const idleDelta = idle - this._prevIdle;

                    if (totalDelta > 0) {
                        totalUsage = Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100));
                    }

                    this._prevTotal = total;
                    this._prevIdle = idle;
                } else if (/^cpu\d+/.test(line)) {
                    const match = line.match(/^(cpu\d+)/);
                    const coreId = match[1];
                    const parts = line.trim().split(/\s+/).slice(1).map(Number);
                    const idle = parts[3] + (parts[4] || 0);
                    const nonIdle = parts[0] + parts[1] + parts[2] + (parts[5] || 0) + (parts[6] || 0) + (parts[7] || 0);
                    const total = idle + nonIdle;

                    let coreUsage = 0;
                    if (this._prevCores.has(coreId)) {
                        const prev = this._prevCores.get(coreId);
                        const totalDelta = total - prev.total;
                        const idleDelta = idle - prev.idle;
                        if (totalDelta > 0) {
                            coreUsage = Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100));
                        }
                    }

                    this._prevCores.set(coreId, { total, idle });
                    cores.push({ id: coreId, usage: Math.round(coreUsage) });
                } else if (line.startsWith('processes ')) {
                    totalProcesses = parseInt(line.split(/\s+/)[1], 10) || 0;
                } else if (line.startsWith('procs_running ')) {
                    runningProcesses = parseInt(line.split(/\s+/)[1], 10) || 0;
                }
            }
        } catch (e) {
        }

        return {
            totalUsage: Math.round(totalUsage),
            totalPercent: Math.round(totalUsage),
            cores,
            totalProcesses,
            runningProcesses,
            frequencyMHz: this.getCpuFrequency(),
            temperatureC: this.getTemperature(),
            model: this.getCpuModel(),
            uptime: this.getUptime(),
        };
    }

    sampleMemory() {
        let memTotal = 0;
        let memAvailable = 0;
        let swapTotal = 0;
        let swapFree = 0;

        try {
            const [ok, bytes] = GLib.file_get_contents('/proc/meminfo');
            if (ok) {
                const text = new TextDecoder().decode(bytes);
                const lines = text.split('\n');

                for (const line of lines) {
                    if (line.startsWith('MemTotal:')) {
                        memTotal = parseInt(line.split(/\s+/)[1], 10);
                    } else if (line.startsWith('MemAvailable:')) {
                        memAvailable = parseInt(line.split(/\s+/)[1], 10);
                    } else if (line.startsWith('SwapTotal:')) {
                        swapTotal = parseInt(line.split(/\s+/)[1], 10);
                    } else if (line.startsWith('SwapFree:')) {
                        swapFree = parseInt(line.split(/\s+/)[1], 10);
                    }
                }
            }
        } catch (e) {
        }

        const memUsed = Math.max(0, memTotal - memAvailable);
        const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
        const swapUsed = Math.max(0, swapTotal - swapFree);
        const swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;

        return {
            totalKiB: memTotal,
            usedKiB: memUsed,
            availableKiB: memAvailable,
            percent: memPercent,
            totalGB: (memTotal / (1024 * 1024)).toFixed(1),
            usedGB: (memUsed / (1024 * 1024)).toFixed(1),
            swapPercent,
            swapUsedGB: (swapUsed / (1024 * 1024)).toFixed(1),
            swapTotalGB: (swapTotal / (1024 * 1024)).toFixed(1),
        };
    }
}
