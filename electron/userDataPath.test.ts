import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveUserDataPath } from './userDataPath';

assert.equal(resolveUserDataPath('profiles'), path.join('profiles', 'kards-toolbox'));
assert.equal(resolveUserDataPath('profiles/other'), path.join('profiles/other', 'kards-toolbox'));
console.log('User data path tests passed');
