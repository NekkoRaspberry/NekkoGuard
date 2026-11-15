import { describe, expect, it } from 'vitest';
import { buildXlsx, columnName, crc32, sheetName } from './xlsx';

/** Reads a stored (uncompressed) ZIP: name → text, verifying each CRC. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = decoder.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, decoder.decode(data));
    at += 30 + nameLength + size;
  }
  expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50); // end of central directory
  expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(files.size);
  return files;
}

describe('buildXlsx', () => {
  const when = new Date(2026, 10, 14, 12, 0);
  const files = unzip(
    buildXlsx({
      name: 'Direct members',
      headers: ['Member', 'Count', 'When', 'Active', 'Note'],
      rows: [
        ['Zoë <zoe@example.test> & co', 3, when, true, null],
        ['=HYPERLINK("http://evil")', -1.5, null, false, ''],
      ],
    }),
  );
  const sheet = files.get('xl/worksheets/sheet1.xml') ?? '';

  it('contains every part Excel needs', () => {
    expect([...files.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    expect(files.get('xl/workbook.xml')).toContain('<sheet name="Direct members"');
  });

  it('writes a bold header row and escaped, unicode-safe text', () => {
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Member</t></is></c>');
    expect(sheet).toContain('Zoë &lt;zoe@example.test&gt; &amp; co');
  });

  it('keeps numbers numeric and dates as real Excel dates', () => {
    expect(sheet).toContain('<c r="B2"><v>3</v></c>');
    expect(sheet).toContain('<c r="B3"><v>-1.5</v></c>');
    // 2026-11-14 12:00 local → 46340.5 days since 1899-12-30
    expect(sheet).toContain('<c r="C2" s="2"><v>46340.5</v></c>');
    expect(sheet).toContain('<t xml:space="preserve">Yes</t>');
  });

  it('never writes formulas, even for text that looks like one', () => {
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('<t xml:space="preserve">=HYPERLINK(&quot;http://evil&quot;)</t>');
  });

  it('leaves empty values as empty cells', () => {
    expect(sheet).not.toContain('r="E2"');
    expect(sheet).not.toContain('r="C3"');
  });
});

describe('helpers', () => {
  it('column letters', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('valid sheet names', () => {
    expect(sheetName('Sites/networks: [all]?')).toBe('Sites networks   all');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
    expect(sheetName('  ')).toBe('Sheet1');
  });

  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
