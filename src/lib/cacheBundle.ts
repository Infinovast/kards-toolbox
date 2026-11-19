import { readCardDataStorage, writeCardDataStorage } from './cardDatabase';
import { initializeCardImageIndex } from './cardImages';
import { validateCardRecords } from './cardData';

// Full distributions mount a binary pack; image bytes never enter IndexedDB.
export async function applyCacheBundle() {
  const desktop = window.kardsDesktop;
  if (!desktop?.prepareCacheBundle) return;
  const stored = await readCardDataStorage();
  const bundle = await desktop.prepareCacheBundle();
  if (bundle?.database && !stored.active) {
    const cards = validateCardRecords(bundle.database.cards);
    await writeCardDataStorage({ ...stored, active: { ...bundle.database, cards } });
  }
  await initializeCardImageIndex(true);
  if (bundle) await desktop.finishCacheBundle();
}
