import { existsSync } from 'node:fs';
import path from 'node:path';

// Renaming the app must keep the user's decks, cached images and settings reachable.
export function resolveUserDataPath(appData: string) {
  const current = path.join(appData, 'KARDS Toolbox');
  const hasData = (directory: string) => existsSync(path.join(directory, 'IndexedDB'));
  if (hasData(current)) return current;
  return ['KARDS 本地军械库', 'KARDS Local Arsenal', 'kards-local-tool']
    .map(name => path.join(appData, name)).find(hasData) || current;
}
