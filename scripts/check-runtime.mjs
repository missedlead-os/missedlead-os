import { spawnSync } from 'node:child_process';

const missing = [];
if (Number(process.versions.node.split('.')[0]) < 24) missing.push('Node.js >= 24');
for (const command of ['ffmpeg', 'ffprobe']) {
 const result = spawnSync(command, ['-version'], { stdio: 'ignore', timeout: 10_000, windowsHide: true });
 if (result.error || result.status !== 0) missing.push(command);
}
if (missing.length) {
 console.error(`WeCover runtime prerequisites unavailable: ${missing.join(', ')}. See docs/RELEASE_READINESS_20261004.md.`);
 process.exitCode = 1;
} else {
 console.log('WeCover runtime prerequisites ready: Node.js, ffmpeg, ffprobe.');
}
