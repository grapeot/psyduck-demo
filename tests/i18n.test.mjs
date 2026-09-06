import { test } from 'node:test';
import assert from 'node:assert/strict';
import messages from '../ui_copy.json' with { type: 'json' };

const paths = (value, prefix = '') => Object.entries(value).flatMap(([key, entry]) => {
  const path = prefix ? `${prefix}.${key}` : key;
  return typeof entry === 'object' ? paths(entry, path) : [path];
});

test('English and Chinese UI dictionaries have complete matching keys', () => {
  assert.deepEqual(paths(messages.en), paths(messages['zh-CN']));
  for (const locale of Object.values(messages)) {
    for (const section of Object.values(locale)) {
      for (const value of Object.values(section)) assert.ok(typeof value === 'string' && value.trim());
    }
  }
});
