export function extractTtsText(content: string) {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => (
      line
      && line.toUpperCase() !== 'WEBVTT'
      && !line.startsWith('//')
      && !/^\d+$/.test(line)
      && !/^(?:[A-Za-z0-9_.-]{1,96}\s*\|\s*)?(?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3}\s*-->/.test(line)
      && !/^NOTE(?:\s|$)/i.test(line)
    ))
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
