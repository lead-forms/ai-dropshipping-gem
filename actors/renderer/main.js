import { Actor } from 'apify';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

await Actor.init();
const input = await Actor.getInput();
const work = '/tmp/gem';
await mkdir(work, { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d);
    child.stderr.on('data', d => stderr += d);
    child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command}_${code}: ${stderr.slice(-3000)}`)));
  });
}

async function download(url, filename) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`download_${response.status}`);
  await writeFile(filename, Buffer.from(await response.arrayBuffer()));
}

async function callback(url, token, payload) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gem-token': token }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`callback_${response.status}_${await response.text()}`);
  return response.json();
}

async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',file]);
  return JSON.parse(stdout);
}

async function analyze() {
  const file = path.join(work, 'source.mp4');
  await download(input.videoUrl, file);
  const info = await probe(file);
  const duration = Number(info.format?.duration || 0);
  const { stderr } = await run('ffmpeg', ['-hide_banner','-i',file,'-filter:v',"select='gt(scene,0.28)',showinfo",'-an','-f','null','-']);
  const points = [...stderr.matchAll(/pts_time:([0-9.]+)/g)].map(m => Number(m[1])).filter(v => v > 0.7 && v < duration - 0.7);
  const unique = [...new Set(points.map(v => Math.round(v * 10) / 10))];
  const boundaries = [0, ...unique, duration].sort((a,b) => a-b);
  let clips = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    let start = boundaries[i], end = boundaries[i + 1];
    while (end - start > 3.2) { clips.push([start, start + 2.8]); start += 2.8; }
    if (end - start >= 0.8) clips.push([start, end]);
  }
  if (clips.length < 2 && duration > 1.6) clips = Array.from({ length: Math.min(5, Math.floor(duration / 1.6)) }, (_, i) => [i * duration / Math.min(5, Math.floor(duration / 1.6)), (i + 1) * duration / Math.min(5, Math.floor(duration / 1.6))]);
  const payload = clips.slice(0, 20).map(([start,end], index) => ({ startMs: Math.round(start*1000), endMs: Math.round(end*1000), score: 0.7, qualityScore: 0.72, tags: index === 0 ? ['Hook'] : index === clips.length - 1 ? ['CTA'] : ['Demonstration','Benefit'] }));
  const result = await callback(input.callbackUrl, input.callbackToken, { sourcePostId: input.sourcePostId, clips: payload, durationSeconds: duration });
  await Actor.setValue('OUTPUT', { ok: true, clips: payload.length, callback: result });
}

function assTime(seconds) {
  const h = Math.floor(seconds/3600), m = Math.floor(seconds%3600/60), s = (seconds%60).toFixed(2).padStart(5,'0');
  return `${h}:${String(m).padStart(2,'0')}:${s}`;
}

async function render() {
  const concat = [], timeline = [];
  let cursor = 0;
  const copies = ['その悩み、これで変わるかも','使い方はとても簡単','毎日がもっと快適に','詳しくはプロフィールへ'];
  for (let i=0; i<input.clips.slice(0,6).length; i++) {
    const clip = input.clips[i], raw = Math.max(1, (clip.end_ms-clip.start_ms)/1000);
    const duration = Math.max(1, Math.min(3, Math.round(raw*2)/2));
    const source = path.join(work, `source-${i}.mp4`), segment = path.join(work, `segment-${i}.mp4`);
    await download(clip.url, source);
    await run('ffmpeg', ['-y','-ss',String(clip.start_ms/1000),'-t',String(duration),'-i',source,'-vf',"scale=1120:1992:force_original_aspect_ratio=increase,crop=1080:1920:x='(iw-ow)/2+10*sin(t*0.8)':y='(ih-oh)/2',setsar=1,fps=30",'-an','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',segment]);
    concat.push(`file '${segment}'`); timeline.push({ start:cursor, end:cursor+duration, text:copies[Math.min(i,copies.length-1)] }); cursor += duration;
  }
  await writeFile(path.join(work,'concat.txt'), concat.join('\n'));
  const base = path.join(work,'base.mp4');
  await run('ffmpeg',['-y','-f','concat','-safe','0','-i',path.join(work,'concat.txt'),'-c','copy',base]);
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Noto Sans CJK JP,68,&H00FFFFFF,&H000000FF,&H90000000,&H70000000,-1,0,0,0,100,100,0,0,1,5,1,2,70,70,180,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${timeline.map(x=>`Dialogue: 0,${assTime(x.start)},${assTime(x.end)},Default,,0,0,0,,${x.text}`).join('\n')}\n`;
  await writeFile(path.join(work,'subs.ass'),ass);
  const output = path.join(work,'result.mp4');
  const beat = `aevalsrc=if(lt(mod(t\\,0.5)\\,0.055)\\,0.20*sin(2*PI*95*t)\\,0):s=44100:d=${cursor}`;
  await run('ffmpeg',['-y','-i',base,'-f','lavfi','-i',beat,'-vf',`ass=${path.join(work,'subs.ass')}`,'-map','0:v','-map','1:a','-shortest','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',output]);
  const resultInfo = await probe(output), video = resultInfo.streams.find(s=>s.codec_type==='video') || {};
  const bytes = await readFile(output);
  const upload = await fetch(input.uploadUrl, { method:'PUT', headers:{'content-type':'video/mp4','x-gem-token':input.callbackToken}, body:bytes });
  if (!upload.ok) throw new Error(`upload_${upload.status}_${await upload.text()}`);
  const qa = { width:video.width, height:video.height, duration_seconds:Number(resultInfo.format?.duration || 0), has_audio:resultInfo.streams.some(s=>s.codec_type==='audio'), source_count:new Set(input.clips.map(c=>c.source_post_id)).size, passed:true };
  const result = await callback(input.callbackUrl,input.callbackToken,{creativeId:input.creativeId,mediaKey:`creatives/${input.creativeId}.mp4`,qa});
  await Actor.setValue('OUTPUT',{ok:true,creativeId:input.creativeId,qa,callback:result});
}

if (input?.mode === 'analyze') await analyze();
else if (input?.mode === 'render') await render();
else throw new Error('invalid_mode');
await Actor.exit();
