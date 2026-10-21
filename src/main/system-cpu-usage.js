// System CPU usage sampler. It compares cumulative OS CPU times between samples.
// This runs in the trusted Electron main process; the renderer only receives a percentage.
'use strict';

function createSystemCpuUsageSampler() {
  let previous = null;
  return function sampleSystemCpuUsagePercent(cpuInfos) {
    if (!Array.isArray(cpuInfos) || cpuInfos.length === 0) {
      previous = null;
      return null;
    }

    let total = 0;
    let idle = 0;
    for (const cpu of cpuInfos) {
      const times = cpu && cpu.times;
      if (!times || typeof times !== 'object') {
        previous = null;
        return null;
      }
      const values = ['user', 'nice', 'sys', 'idle', 'irq'].map((key) => Number(times[key]));
      if (values.some((value) => !Number.isFinite(value) || value < 0)) {
        previous = null;
        return null;
      }
      total += values.reduce((sum, value) => sum + value, 0);
      idle += values[3];
    }

    const current = { coreCount: cpuInfos.length, total, idle };
    if (!previous || previous.coreCount !== current.coreCount || current.total <= previous.total) {
      previous = current;
      return null;
    }

    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    previous = current;
    if (totalDelta <= 0 || idleDelta < 0 || idleDelta > totalDelta) return null;
    const percent = ((totalDelta - idleDelta) / totalDelta) * 100;
    return Math.round(Math.max(0, Math.min(100, percent)) * 10) / 10;
  };
}

module.exports = { createSystemCpuUsageSampler };
