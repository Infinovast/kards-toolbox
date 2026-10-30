import path from 'node:path';

export function resolveUserDataPath(appData: string) {
  return path.join(appData, 'kards-toolbox');
}
