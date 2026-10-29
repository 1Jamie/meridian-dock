import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const NM_NAME = 'org.freedesktop.NetworkManager';

function unpack(value) {
    while (value instanceof GLib.Variant)
        value = value.deep_unpack();
    return value;
}

export class NetDev {
    constructor() {
        this._prevRx = 0;
        this._prevTx = 0;
        this._prevTime = GLib.get_monotonic_time();
        this._activeInterface = null;
        this._ipAddress = '--';
        this._nmProxy = null;
        this._minCeiling = 5 * 1024 * 1024;
        this._peakRx = this._minCeiling;
        this._peakTx = this._minCeiling;
    }

    _readText(path) {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            return '';
        return new TextDecoder().decode(bytes);
    }

    _findActiveInterface() {
        try {
            const lines = this._readText('/proc/net/route').split('\n');
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 2 && parts[1] === '00000000')
                    return parts[0];
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    _nmManager() {
        if (this._nmProxy)
            return this._nmProxy;
        try {
            this._nmProxy = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.NONE,
                null,
                NM_NAME,
                '/org/freedesktop/NetworkManager',
                NM_NAME,
                null
            );
        } catch (e) {
            this._nmProxy = null;
        }
        return this._nmProxy;
    }

    _proxy(path, iface) {
        return Gio.DBusProxy.new_for_bus_sync(
            Gio.BusType.SYSTEM,
            Gio.DBusProxyFlags.NONE,
            null,
            NM_NAME,
            path,
            iface,
            null
        );
    }

    _ipv4FromHex(hex) {
        const value = parseInt(hex, 16);
        const b1 = value & 0xff;
        const b2 = (value >> 8) & 0xff;
        const b3 = (value >> 16) & 0xff;
        const b4 = (value >> 24) & 0xff;
        return `${b1}.${b2}.${b3}.${b4}`;
    }

    _addressFromFibTrie(iface) {
        let text = '';
        try {
            text = this._readText('/proc/net/fib_trie');
        } catch (e) {
            return '--';
        }

        const locals = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/(\d+\.\d+\.\d+\.\d+)/);
            if (!match)
                continue;
            const next = (lines[i + 1] || '').trim();
            if (next.startsWith('/32 host LOCAL') && !match[1].startsWith('127.'))
                locals.push(match[1]);
        }
        if (locals.length === 0)
            return '--';
        if (!iface || locals.length === 1)
            return locals[0];

        try {
            const routes = this._readText('/proc/net/route').split('\n');
            for (let i = 1; i < routes.length; i++) {
                const parts = routes[i].trim().split(/\s+/);
                if (parts[0] !== iface || parts[1] === '00000000' || parts.length < 8)
                    continue;
                const dest = this._ipv4FromHex(parts[1]).split('.').map(Number);
                const mask = this._ipv4FromHex(parts[7]).split('.').map(Number);
                for (const local of locals) {
                    const octets = local.split('.').map(Number);
                    const sameNet = octets.every((octet, idx) => (octet & mask[idx]) === (dest[idx] & mask[idx]));
                    if (sameNet)
                        return local;
                }
            }
        } catch (e) {
            return locals[0];
        }
        return locals[0];
    }

    _getIpAddress(iface) {
        if (!iface)
            return '--';
        const fromBus = this._addressFromNetworkManager(iface);
        if (fromBus !== '--')
            return fromBus;
        return this._addressFromFibTrie(iface);
    }

    _addressFromNetworkManager(iface) {
        const manager = this._nmManager();
        if (!manager)
            return '--';

        try {
            const deviceVariant = manager.call_sync(
                'GetDeviceByIpIface',
                new GLib.Variant('(s)', [iface]),
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
            const devicePath = deviceVariant.deep_unpack()[0];
            const device = this._proxy(devicePath, `${NM_NAME}.Device`);
            const ip4Variant = device.get_cached_property('Ip4Config');
            if (!ip4Variant)
                return '--';

            const ip4Path = ip4Variant.deep_unpack();
            if (!ip4Path || ip4Path === '/')
                return '--';

            const ip4 = this._proxy(ip4Path, `${NM_NAME}.IP4Config`);
            const addressVariant = ip4.get_cached_property('AddressData');
            if (!addressVariant)
                return '--';

            const addresses = unpack(addressVariant);
            if (!Array.isArray(addresses))
                return '--';

            for (const raw of addresses) {
                const entry = unpack(raw);
                const address = unpack(entry.address);
                if (typeof address === 'string' && address.length > 0)
                    return address;
            }
        } catch (e) {
            return '--';
        }
        return '--';
    }

    sample() {
        const currentTime = GLib.get_monotonic_time();
        const deltaTime = (currentTime - this._prevTime) / 1000000;
        this._prevTime = currentTime;

        let activeIface = this._findActiveInterface();
        let rxBytes = 0;
        let txBytes = 0;

        try {
            const lines = this._readText('/proc/net/dev').split('\n');
            let fallbackIface = null;

            for (let i = 2; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line)
                    continue;
                const colonIdx = line.indexOf(':');
                if (colonIdx === -1)
                    continue;

                const iface = line.substring(0, colonIdx).trim();
                if (iface === 'lo')
                    continue;

                const stats = line.substring(colonIdx + 1).trim().split(/\s+/).map(Number);
                const rx = stats[0] || 0;
                const tx = stats[8] || 0;

                if (!fallbackIface && (rx > 0 || tx > 0))
                    fallbackIface = iface;
                if (!activeIface)
                    activeIface = fallbackIface;
                if (iface === activeIface) {
                    rxBytes = rx;
                    txBytes = tx;
                    break;
                }
            }

            if (!activeIface && fallbackIface)
                activeIface = fallbackIface;
        } catch (e) {
            activeIface = this._activeInterface;
        }

        let downSpeed = 0;
        let upSpeed = 0;
        if (this._prevRx > 0 && deltaTime > 0 && rxBytes >= this._prevRx)
            downSpeed = (rxBytes - this._prevRx) / deltaTime;
        if (this._prevTx > 0 && deltaTime > 0 && txBytes >= this._prevTx)
            upSpeed = (txBytes - this._prevTx) / deltaTime;

        this._prevRx = rxBytes;
        this._prevTx = txBytes;

        const validDelta = Math.max(0.1, Math.min(deltaTime || 1.0, 60));
        const decay = Math.pow(0.992, validDelta);
        if (downSpeed > this._peakRx)
            this._peakRx = downSpeed;
        else
            this._peakRx = Math.max(this._minCeiling, this._peakRx * decay);
        if (upSpeed > this._peakTx)
            this._peakTx = upSpeed;
        else
            this._peakTx = Math.max(this._minCeiling, this._peakTx * decay);

        if (activeIface !== this._activeInterface) {
            this._activeInterface = activeIface;
            this._ipAddress = this._getIpAddress(activeIface);
        }

        return {
            interface: activeIface || 'net',
            ip: this._ipAddress,
            downSpeedBytes: downSpeed,
            upSpeedBytes: upSpeed,
            downFormatted: this._formatSpeed(downSpeed),
            upFormatted: this._formatSpeed(upSpeed),
            downPercent: this._calcAdaptivePercent(downSpeed, this._peakRx),
            upPercent: this._calcAdaptivePercent(upSpeed, this._peakTx),
            peakRxBytes: this._peakRx,
            peakTxBytes: this._peakTx,
            peakRxFormatted: this._formatSpeed(this._peakRx),
            peakTxFormatted: this._formatSpeed(this._peakTx),
        };
    }

    _calcAdaptivePercent(bytesPerSec, currentPeak) {
        if (!bytesPerSec || bytesPerSec < 1024)
            return 0;
        const peak = Math.max(currentPeak || this._minCeiling, this._minCeiling);
        if (bytesPerSec >= peak)
            return 100;

        const logMin = Math.log10(1024);
        const logPeak = Math.log10(peak);
        const logVal = Math.log10(bytesPerSec);
        const range = logPeak - logMin;
        if (range <= 0)
            return 100;

        const pct = ((logVal - logMin) / range) * 100;
        return Math.min(100, Math.max(0, Math.round(pct)));
    }

    _formatSpeed(bytesPerSec) {
        if (bytesPerSec < 1024)
            return `${Math.round(bytesPerSec)} B/s`;
        if (bytesPerSec < 1024 * 1024)
            return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
}
