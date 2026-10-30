import localforage from 'localforage';
import { readCardDataStorage, writeCardDataStorage } from './cardDatabase';

// Runs before App mounts, so data loaders and automatic image requests cannot
// race the initial import. Every write is awaited before the completion marker.
export async function applyCacheBundle(progress: (completed: number, total: number) => void) {
  const desktop = window.kardsDesktop;
  if (!desktop?.prepareCacheBundle) return;
  const bundle = await desktop.prepareCacheBundle();
  if (!bundle) return;
  const stored = await readCardDataStorage();
  progress(0, bundle.imageCount);
  for (let index = 0; index < bundle.imageCount; index++) {
    const { key, value } = await desktop.readCacheBundleImage(index);
    if (await localforage.getItem(key) === null) await localforage.setItem(key, value);
    progress(index + 1, bundle.imageCount);
  }
  if (!stored.active) await writeCardDataStorage({ ...stored, active: bundle.database });
  await desktop.finishCacheBundle();
}
