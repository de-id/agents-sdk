import { SlimRTCStatsReport } from '../types';

export function createVideoStatsReport(
    stats: SlimRTCStatsReport[],
    previousStats?: SlimRTCStatsReport
): SlimRTCStatsReport[] {
    return stats.map((report, index) => {
        if (index === 0) {
            if (!previousStats) {
                return {
                    index,
                    timestamp: report.timestamp,
                    bytesReceived: report.bytesReceived,
                    packetsReceived: report.packetsReceived,
                    packetsLost: report.packetsLost,
                    jitter: report.jitter,
                    frameWidth: report.frameWidth,
                    frameHeight: report.frameHeight,
                    frameRate: report.frameRate,
                };
            }
            
            return {
                index,
                timestamp: report.timestamp,
                bytesReceived: report.bytesReceived - previousStats.bytesReceived,
                packetsReceived: report.packetsReceived - previousStats.packetsReceived,
                packetsLost: report.packetsLost - previousStats.packetsLost,
                jitter: report.jitter,
                frameWidth: report.frameWidth,
                frameHeight: report.frameHeight,
                frameRate: report.frameRate,
            };
        }

        return {
            index,
            timestamp: report.timestamp,
            bytesReceived: report.bytesReceived - stats[index - 1].bytesReceived,
            packetsReceived: report.packetsReceived - stats[index - 1].packetsReceived,
            packetsLost: report.packetsLost - stats[index - 1].packetsLost,
            jitter: report.jitter,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            frameRate: report.frameRate,
        };
    });
}
