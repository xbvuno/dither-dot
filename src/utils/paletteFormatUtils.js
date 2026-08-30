const MAX_PALETTE_COLORS = 64;
const MIN_PALETTE_COLORS = 2;

/**
 * Normalizes a hex string to lowercase '#rrggbb' format.
 */
export function normalizeHex(hex) {
  const raw = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((c) => c + c).join('').toLowerCase()}`;
  }
  return null;
}

/**
 * Converts RGB numbers (0-255) to '#rrggbb'.
 */
export function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const clamped = Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Normalizes an array of color entries, removing duplicates and capping at MAX_PALETTE_COLORS.
 */
export function normalizeHexList(list) {
  const unique = [];
  const seen = new Set();

  for (const entry of list || []) {
    const hex = normalizeHex(entry);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    unique.push(hex);
    if (unique.length >= MAX_PALETTE_COLORS) break;
  }

  return unique;
}

/**
 * Exports an array of hex colors to standard .hex format (6-character hex per line without hash).
 */
export function exportToHex(colors) {
  const hexList = (colors || [])
    .map((c) => (typeof c === 'string' ? c : c?.hex))
    .map(normalizeHex)
    .filter(Boolean);

  return hexList.map((h) => h.replace('#', '')).join('\n') + '\n';
}

/**
 * Parses GIMP Palette (.gpl) format.
 * Example:
 * GIMP Palette
 * Name: DawnBringer 16
 * Columns: 4
 * # Comment
 * 20  12  28   Black
 * 68  36  52   Dark Red
 */
export function parseGpl(text) {
  const lines = String(text || '').split(/\r?\n/);
  const isGplHeader = lines.some((l) => /^GIMP Palette/i.test(l.trim()));
  if (!isGplHeader) return null;

  let name = null;
  const colors = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const nameMatch = /^Name:\s*(.+)$/i.exec(trimmed);
    if (nameMatch) {
      name = nameMatch[1].trim();
      continue;
    }

    if (/^(GIMP Palette|Columns:)/i.test(trimmed)) {
      continue;
    }

    // Color lines: R G B [optional label]
    const match = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(trimmed);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      if (r <= 255 && g <= 255 && b <= 255) {
        colors.push(rgbToHex(r, g, b));
      }
    }
  }

  const normalized = normalizeHexList(colors);
  if (normalized.length === 0) return null;

  return {
    format: 'GPL (GIMP)',
    name: name || 'GIMP Palette',
    colors: normalized,
  };
}

/**
 * Parses JASC-PAL (.pal) format.
 * Example:
 * JASC-PAL
 * 0100
 * 16
 * 20 12 28
 * 68 36 52
 */
export function parseJascPal(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;

  if (lines[0].toUpperCase() !== 'JASC-PAL') return null;

  const colors = [];
  // Line 1 is JASC-PAL, Line 2 is 0100, Line 3 is color count
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    const match = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(line);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      if (r <= 255 && g <= 255 && b <= 255) {
        colors.push(rgbToHex(r, g, b));
      }
    }
  }

  const normalized = normalizeHexList(colors);
  if (normalized.length === 0) return null;

  return {
    format: 'JASC-PAL (.pal)',
    name: 'JASC Palette',
    colors: normalized,
  };
}

/**
 * Parses Paint.NET PAL (.pal) format.
 * Example:
 * ; Paint.NET Palette File
 * FF140C1C
 * FF442434
 */
export function parsePaintNetPal(text) {
  const lines = String(text || '').split(/\r?\n/);
  const isPaintNetHeader = lines.some((l) => /Paint\.NET Palette File/i.test(l));
  
  const colors = [];
  let containsHex8 = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';')) continue;

    // Paint.NET stores AARRGGBB in hex
    if (/^[0-9a-fA-F]{8}$/.test(trimmed)) {
      containsHex8 = true;
      const rrggbb = trimmed.slice(2);
      colors.push(`#${rrggbb.toLowerCase()}`);
    } else if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
      colors.push(`#${trimmed.toLowerCase()}`);
    }
  }

  if (!isPaintNetHeader && !containsHex8) return null;

  const normalized = normalizeHexList(colors);
  if (normalized.length === 0) return null;

  return {
    format: 'Paint.NET (.pal)',
    name: 'Paint.NET Palette',
    colors: normalized,
  };
}

/**
 * Parses JSON palette formats (e.g. array of strings, Lospec JSON, Aseprite JSON).
 */
export function parseJsonPalette(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;

  try {
    const data = JSON.parse(trimmed);
    let name = null;
    let rawColors = [];

    if (Array.isArray(data)) {
      rawColors = data;
    } else if (data && typeof data === 'object') {
      name = data.name || data.title || null;
      if (Array.isArray(data.colors)) {
        rawColors = data.colors;
      } else if (Array.isArray(data.palette)) {
        rawColors = data.palette;
      } else if (Array.isArray(data.values)) {
        rawColors = data.values;
      }
    }

    const colors = [];
    for (const item of rawColors) {
      if (typeof item === 'string') {
        const hex = normalizeHex(item);
        if (hex) colors.push(hex);
      } else if (item && typeof item === 'object') {
        if ('hex' in item && typeof item.hex === 'string') {
          const hex = normalizeHex(item.hex);
          if (hex) colors.push(hex);
        } else if ('r' in item && 'g' in item && 'b' in item) {
          colors.push(rgbToHex(item.r, item.g, item.b));
        } else if (Array.isArray(item) && item.length >= 3) {
          colors.push(rgbToHex(item[0], item[1], item[2]));
        }
      }
    }

    const normalized = normalizeHexList(colors);
    if (normalized.length === 0) return null;

    return {
      format: 'JSON',
      name: name || 'JSON Palette',
      colors: normalized,
    };
  } catch {
    return null;
  }
}

/**
 * Parses .hex files or lists of hex codes (separated by newlines, commas, spaces).
 */
export function parseHexList(text) {
  const rawText = String(text || '');
  // Matches 6-digit hex or 3-digit hex with optional leading #
  const matches = rawText.match(/#?[0-9a-fA-F]{6}\b|#?[0-9a-fA-F]{3}\b/g) || [];
  const normalized = normalizeHexList(matches);

  if (normalized.length === 0) return null;

  // Check if each non-empty line was a clean 6-digit hex (classic .hex file)
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const isStrictHexFile = lines.length > 0 && lines.every((l) => /^#?[0-9a-fA-F]{6}$/.test(l));

  return {
    format: isStrictHexFile ? '.HEX' : 'Plain Text',
    name: 'Hex Palette',
    colors: normalized,
  };
}

/**
 * Parses binary Adobe Color Table (.act) files if an ArrayBuffer is passed.
 */
export function parseActBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer) && !(buffer instanceof Uint8Array)) {
    return null;
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 768) return null;

  const colors = [];
  // An ACT file has 256 colors * 3 bytes (R, G, B) = 768 bytes
  // If bytes.length >= 772, the last 4 bytes are color count and transparent index
  let totalColors = 256;
  if (bytes.length >= 772) {
    const count = (bytes[768] << 8) | bytes[769];
    if (count > 0 && count <= 256) {
      totalColors = count;
    }
  }

  for (let i = 0; i < totalColors; i++) {
    const offset = i * 3;
    const r = bytes[offset];
    const g = bytes[offset + 1];
    const b = bytes[offset + 2];
    colors.push(rgbToHex(r, g, b));
  }

  const normalized = normalizeHexList(colors);
  if (normalized.length === 0) return null;

  return {
    format: 'ACT (Adobe)',
    name: 'Adobe ACT Palette',
    colors: normalized,
  };
}

/**
 * Master parser that automatically detects the format from text or ArrayBuffer.
 */
export function detectAndParsePalette(content, fallbackName = 'Imported Palette') {
  if (!content) {
    return { format: null, name: fallbackName, colors: [], error: 'No content provided' };
  }

  if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
    const actResult = parseActBuffer(content);
    if (actResult) {
      return {
        ...actResult,
        name: fallbackName !== 'Imported Palette' ? fallbackName : actResult.name,
      };
    }
  }

  const text = typeof content === 'string' ? content : '';
  const trimmed = text.trim();
  if (!trimmed) {
    return { format: null, name: fallbackName, colors: [], error: 'Empty content' };
  }

  // 1. Try GPL
  const gpl = parseGpl(text);
  if (gpl) {
    return {
      ...gpl,
      name: gpl.name && gpl.name !== 'GIMP Palette' ? gpl.name : fallbackName,
    };
  }

  // 2. Try JASC-PAL
  const jasc = parseJascPal(text);
  if (jasc) {
    return {
      ...jasc,
      name: fallbackName !== 'Imported Palette' ? fallbackName : jasc.name,
    };
  }

  // 3. Try Paint.NET PAL
  const paintNet = parsePaintNetPal(text);
  if (paintNet) {
    return {
      ...paintNet,
      name: fallbackName !== 'Imported Palette' ? fallbackName : paintNet.name,
    };
  }

  // 4. Try JSON
  const json = parseJsonPalette(text);
  if (json) {
    return {
      ...json,
      name: json.name && json.name !== 'JSON Palette' ? json.name : fallbackName,
    };
  }

  // 5. Try HEX / Plain text
  const hexResult = parseHexList(text);
  if (hexResult && hexResult.colors.length >= MIN_PALETTE_COLORS) {
    return {
      ...hexResult,
      name: fallbackName,
    };
  }

  if (hexResult && hexResult.colors.length > 0) {
    return {
      ...hexResult,
      name: fallbackName,
      error: `Only ${hexResult.colors.length} color found (minimum is ${MIN_PALETTE_COLORS}).`,
    };
  }

  return {
    format: null,
    name: fallbackName,
    colors: [],
    error: 'No valid colors or recognized palette format found.',
  };
}
