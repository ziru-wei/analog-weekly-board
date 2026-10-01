"""Shrinks the two CJK fonts to the characters people actually type, as WOFF2.
Usage: python scripts/subset-fonts.py <dir with original LXGWWenKai-Medium.ttf and SarasaMonoHC-Regular.ttf>
Needs: pip install fonttools brotli.  Coverage: ASCII/Latin, punctuation, GB2312 (simplified, ~6.7k) and
Big5 level 1 (traditional, ~5.4k), kana, hangul jamo-free basics. Characters outside the set fall back to the next font."""
import codecs, subprocess, sys, tempfile, pathlib

src = pathlib.Path(sys.argv[1]); out = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'fonts'
chars = set(map(chr, range(0x20, 0x250)))                       # ASCII + Latin
chars |= set(map(chr, range(0x2000, 0x2070))) | set(map(chr, range(0x3000, 0x3040))) | set(map(chr, range(0xFF00, 0xFFF0)))
chars |= set(map(chr, range(0x3040, 0x3100)))                    # kana
chars |= set('←↑→↓↔·•…—–“”‘’《》〈〉『』「」【】〔〕※★☆○●◎◇◆□■△▲▽▼℃°×÷±≤≥≠≈')
for hi in range(0xA1, 0xF8):                                      # GB2312
    for lo in range(0xA1, 0xFF):
        try: chars.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError: pass
for hi in range(0xA4, 0xC7):                                      # Big5 level 1 (common traditional)
    for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
        try: chars.add(bytes([hi, lo]).decode('big5'))
        except UnicodeDecodeError: pass
print(len(chars), 'characters')
with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False, encoding='utf-8') as f: f.write(''.join(sorted(chars))); text = f.name
for name, dest in [('LXGWWenKai-Medium.ttf', 'LXGWWenKai-Medium.subset.woff2'), ('SarasaMonoHC-Regular.ttf', 'SarasaMonoHC-Regular.subset.woff2')]:
    subprocess.run(['pyftsubset', str(src / name), f'--text-file={text}', '--flavor=woff2', f'--output-file={out / dest}',
                    '--layout-features=*', '--glyph-names', '--no-hinting', '--desubroutinize'], check=True)
    print(dest, round((out / dest).stat().st_size / 1e6, 2), 'MB')
