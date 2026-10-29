import GLib from 'gi://GLib';

export class MetricLoop {
    constructor({settings, proc, net, disk, clock, cpu, mem, diskDial, netDial, dock}) {
        this._settings = settings;
        this._proc = proc;
        this._net = net;
        this._disk = disk;
        this._clock = clock;
        this._cpu = cpu;
        this._mem = mem;
        this._diskDial = diskDial;
        this._netDial = netDial;
        this._dock = dock;
        this._pill = null;
        this._metricTimerId = null;
        this._clockTimerId = null;
    }

    setPill(pill) {
        this._pill = pill;
    }

    start() {
        const interval = Math.max(1, this._settings.get_int('update-interval'));
        this._update();
        if (this._metricTimerId) {
            GLib.Source.remove(this._metricTimerId);
            this._metricTimerId = null;
        }
        this._metricTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
        if (this._clockTimerId) {
            GLib.Source.remove(this._clockTimerId);
            this._clockTimerId = null;
        }
        this._clockTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const host = this._dock.getHost();
            if (this._clock.visible && host && host.visible)
                this._clock.updateTime();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._metricTimerId) {
            GLib.Source.remove(this._metricTimerId);
            this._metricTimerId = null;
        }
        if (this._clockTimerId) {
            GLib.Source.remove(this._clockTimerId);
            this._clockTimerId = null;
        }
    }

    _update() {
        const cpuData = this._proc.sampleCpu();
        const memData = this._proc.sampleMemory();
        const diskData = this._disk.sample();
        const netData = this._net.sample();

        if (this._pill)
            this._pill.updateMetrics(cpuData, memData, netData, diskData);

        const host = this._dock.getHost();
        if (!host || !host.visible || host.opacity === 0)
            return;

        if (this._cpu.visible)
            this._cpu.updateData(cpuData);
        if (this._clock.visible)
            this._clock.setUptime(cpuData.uptime);

        if (memData && this._mem.visible) {
            const swapSub = (memData.swapTotalGB > 0 && parseFloat(memData.swapTotalGB) > 0)
                ? `SWAP ${memData.swapPercent}%`
                : `AVAIL ${(memData.availableKiB / (1024 * 1024)).toFixed(1)} GB`;
            this._mem.updateMetric(
                memData.percent,
                `${memData.usedGB} / ${memData.totalGB} GB`,
                swapSub,
                memData.swapPercent || 0
            );
        }

        if (diskData && this._diskDial.visible) {
            const rootDisk = diskData.root;
            if (rootDisk) {
                const homeDisk = diskData.home;
                const diskSub = homeDisk
                    ? `HOME ${homeDisk.usedPercent}%`
                    : `FREE ${rootDisk.freeGB} GB`;
                this._diskDial.updateMetric(
                    rootDisk.usedPercent,
                    `${rootDisk.usedGB} / ${rootDisk.totalGB} GB`,
                    diskSub,
                    homeDisk ? (homeDisk.usedPercent || 0) : 0
                );
            }
        }

        if (netData && this._netDial.visible) {
            const ifaceText = netData.ip ? `${netData.interface}  ${netData.ip}` : netData.interface;
            this._netDial.updateMetric(
                netData.downPercent,
                `${netData.downFormatted}   ${netData.upFormatted}`,
                ifaceText,
                netData.upPercent,
                netData.downFormatted,
                netData.upFormatted
            );
        }
    }
}
