import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const poseFixture = {
  url: 'https://storage.googleapis.com/mediapipe-assets/pose.jpg',
  sha256: 'c8a830ed683c0276d713dd5aeda28f415f10cd6291972084a40d0d8b934ed62b',
  bytes: 44100,
  description: '公开 MediaPipe 样例：海边瑜伽垫上一名双臂水平伸展的人物。已实际读图确认；仅用于静态正样本推理，不是本机真人相机测试。照片不纳入 Git 或生产资源。'
};
export async function preparePoseFixture() {
  await mkdir('test-results', { recursive: true });
  let image;
  try { image = await readFile('test-results/pose.jpg'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const valid = data => data?.length === poseFixture.bytes && createHash('sha256').update(data).digest('hex') === poseFixture.sha256;
  if (!valid(image)) {
    const response = await fetch(poseFixture.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Public pose fixture unavailable: ${response.status}`);
    image = Buffer.from(await response.arrayBuffer());
    if (!valid(image)) throw new Error('Public pose fixture digest mismatch');
    await writeFile('test-results/pose.jpg', image);
  }
  await writeFile('test-results/pose-fixture.json', JSON.stringify(poseFixture, null, 2));
  return image;
}
