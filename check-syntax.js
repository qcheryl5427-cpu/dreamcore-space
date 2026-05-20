const fs = require('fs');
let s = fs.readFileSync('index.html', 'utf8');
s = s.slice(s.indexOf('<script type="module">') + 22);
s = s.slice(0, s.indexOf('</script>'));
s = s.replace(/import\s+.*?from\s+['"].*?['"];?/g, '');
s = s.replace(/import\s*\{[^}]+\}\s*from\s+['"].*?['"];?/g, '');
try {
  new Function(s);
  console.log('Syntax OK');
} catch (e) {
  console.error('Syntax error:', e.message);
  process.exit(1);
}
