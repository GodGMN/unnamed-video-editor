import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDrop, projectNameFor } from '../src/projects/drop.ts';

const file = (name, type = '') => new File([], name, { type });
const names = (files) => files.map((f) => f.name);

test('project files, media and other files are told apart', () => {
  const { projects, media, unsupported } = classifyDrop([
    file('edit.json', 'application/json'), file('trip.uvepack'), file('clip.mp4', 'video/mp4'),
    file('raw.MKV'), file('song.mp3', 'audio/mpeg'), file('logo.png', 'image/png'), file('notes.pdf', 'application/pdf'), file('folder'),
  ]);
  assert.deepEqual(names(projects), ['edit.json', 'trip.uvepack']);
  assert.deepEqual(names(media), ['clip.mp4', 'raw.MKV', 'song.mp3', 'logo.png']);
  assert.deepEqual(names(unsupported), ['notes.pdf', 'folder']);
});

test('media is recognized by its type when the extension is unusual', () => {
  assert.deepEqual(names(classifyDrop([file('capture.xyz', 'video/quicktime')]).media), ['capture.xyz']);
});

test('a project from dropped media is named after the first file', () => {
  assert.equal(projectNameFor(file('beach-trip.final.mp4')), 'beach-trip.final');
  assert.equal(projectNameFor(file('.mp4')), '.mp4');
});
