import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveUserDataPath } from './userDataPath';

const root = mkdtempSync(path.join(tmpdir(), 'kards-toolbox-profile-'));
try {
  assert.equal(resolveUserDataPath(root), path.join(root, 'KARDS Toolbox'));
  for (const name of ['KARDS 本地军械库', 'KARDS Local Arsenal', 'kards-local-tool']) {
    const appData = path.join(root, name);
    const legacy = path.join(appData, name);
    mkdirSync(path.join(legacy, 'IndexedDB'), { recursive: true });
    const sentinel = path.join(legacy, 'IndexedDB', 'keep.txt');
    writeFileSync(sentinel, 'existing user data');
    // An empty newly-created Toolbox folder must not shadow an older profile.
    mkdirSync(path.join(appData, 'KARDS Toolbox'), { recursive: true });
    assert.equal(resolveUserDataPath(appData), legacy);
    assert.equal(readFileSync(sentinel, 'utf8'), 'existing user data');
    mkdirSync(path.join(appData, 'KARDS Toolbox', 'IndexedDB'));
    assert.equal(resolveUserDataPath(appData), path.join(appData, 'KARDS Toolbox'));
  }
  console.log('User profile rename compatibility tests passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
