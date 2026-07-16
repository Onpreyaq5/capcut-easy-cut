import { describe, expect, it } from 'vitest';
import { activeLineIndex, groupWords, toSRT, type SubLine, type SubWord } from './subtitleTypes';

const words: SubWord[] = [
  { text: 'โลก', start: 1, end: 1.4 },
  { text: 'สวัสดี', start: 0, end: 0.5 },
  { text: 'ครับ', start: 0.55, end: 0.9 },
];

describe('subtitle timeline helpers', () => {
  it('sorts out-of-order timestamps before grouping', () => {
    const lines = groupWords(words, 2);
    expect(lines[0].words.map((word) => word.text)).toEqual(['สวัสดี', 'ครับ']);
    expect(lines[1].words[0].text).toBe('โลก');
  });

  it('splits automatic lines at a long pause', () => {
    const lines = groupWords([
      { text: 'หนึ่ง', start: 0, end: 0.3 },
      { text: 'สอง', start: 1, end: 1.3 },
    ], 0);
    expect(lines).toHaveLength(2);
  });

  it('keeps automatic Thai caption lines compact', () => {
    const lines = groupWords([
      { text: 'หนึ่งสองสามสี่ห้า', start: 0, end: 0.2 },
      { text: 'หกเจ็ดแปดเก้า', start: 0.21, end: 0.4 },
    ], 0);
    expect(lines).toHaveLength(2);
  });

  it('keeps a continuous caption active until the next line', () => {
    const lines: SubLine[] = [
      { id: 'a', words: [{ text: 'หนึ่ง', start: 0, end: 0.5 }] },
      { id: 'b', words: [{ text: 'สอง', start: 1, end: 1.5 }] },
    ];
    expect(activeLineIndex(lines, 0.8, false)).toBe(-1);
    expect(activeLineIndex(lines, 0.8, true)).toBe(0);
  });

  it('exports stable SRT timestamps and Thai text', () => {
    const srt = toSRT(groupWords(words, 3), false);
    expect(srt).toContain('00:00:00,000 --> 00:00:01,400');
    expect(srt).toContain('สวัสดี ครับ โลก');
  });
});
