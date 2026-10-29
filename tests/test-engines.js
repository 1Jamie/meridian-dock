import GLib from 'gi://GLib';

import {ProcStat} from '../src/engine/ProcStat.js';
import {NetDev} from '../src/engine/NetDev.js';
import {DiskStat} from '../src/engine/DiskStat.js';
import {ProcessTracker} from '../src/engine/ProcessTracker.js';
import {SocketTracker} from '../src/engine/SocketTracker.js';

const proc = new ProcStat();
const net = new NetDev();
const disk = new DiskStat();
const procs = new ProcessTracker();
const sockets = new SocketTracker();

print('--- TESTING CPU & MEMORY ---');
const cpuData = proc.sampleCpu();
print(`Model: ${cpuData.model}`);
print(`Freq: ${cpuData.frequencyMHz} MHz | Temp: ${cpuData.temperatureC}°C | Uptime: ${cpuData.uptime}`);
print(`CPU Cores detected: ${cpuData.cores.length}`);
const memData = proc.sampleMemory();
print(`Memory: ${memData.usedGB} / ${memData.totalGB} GB (${memData.percent}%)`);

print('\n--- TESTING STORAGE ---');
const diskData = disk.sample();
print(`Root: ${diskData.root.usedGB} / ${diskData.root.totalGB} GB (${diskData.root.usedPercent}%)`);
if (diskData.home)
    print(`Home: ${diskData.home.usedGB} / ${diskData.home.totalGB} GB (${diskData.home.usedPercent}%)`);

print('\n--- TESTING NETWORK ---');
const netData = net.sample();
print(`Interface: ${netData.interface} | IP: ${netData.ip}`);
print(`Down: ${netData.downFormatted} (${netData.downPercent}%) | Up: ${netData.upFormatted} (${netData.upPercent}%)`);
print(`Dynamic Ceilings: PeakRx = ${netData.peakRxFormatted} | PeakTx = ${netData.peakTxFormatted}`);

print('\n--- TESTING PROCESS TRACKER ---');
procs.sampleTopProcesses(3, 'cpu');
GLib.usleep(250000);
const topCpu = procs.sampleTopProcesses(3, 'cpu');
print(`Sampled ${topCpu.length} top CPU processes:`);
for (const item of topCpu)
    print(` - ${item.name} (PID ${item.pid}): ${item.cpu}% CPU, ${item.memMB} MB`);
const topMem = procs.sampleTopProcesses(3, 'mem');
print(`Sampled ${topMem.length} top RAM processes:`);
for (const item of topMem)
    print(` - ${item.name} (PID ${item.pid}): ${item.memMB} MB, ${item.cpu}% CPU`);

print('\n--- TESTING SOCKET TRACKER ---');
const conns = sockets.sampleEstablished(3);
print(`Sampled ${conns.length} established sockets:`);
for (const conn of conns)
    print(` - ${conn.display || `${conn.local} -> ${conn.remote}`} [${conn.state}]`);
const listeners = sockets.sampleListening(3);
print(`Sampled ${listeners.length} listening sockets:`);
for (const listener of listeners)
    print(` - ${listener.display} [${listener.state}]`);

print('\n>>> ALL ENGINES OPERATIONAL! <<<');
