import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
const Markdown = new Function('module', src('markdown.js') + ';return Markdown')();

test('text is escaped before anything else, so no markup gets through', () => {
  const html = Markdown.render('<script>alert(1)</script> <img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;script&gt;/);
});

test('bold, italic, strikethrough and code', () => {
  assert.equal(Markdown.inline('a **b** *c* ~~d~~ `e`'), 'a <strong>b</strong> <em>c</em> <del>d</del> <code>e</code>');
});

test('names with underscores are left alone and code is not formatted', () => {
  assert.equal(Markdown.inline('usé add_room y set_floor_finish'), 'usé add_room y set_floor_finish');
  assert.equal(Markdown.inline('`**no**`'), '<code>**no**</code>');
});

test('only http and https links become anchors', () => {
  assert.match(Markdown.inline('[sitio](https://example.com/a?b=1)'), /<a href="https:\/\/example\.com\/a\?b=1" target="_blank" rel="noopener noreferrer">sitio<\/a>/);
  assert.ok(!Markdown.inline('[x](javascript:alert(1))').includes('<a '));
  assert.ok(!Markdown.inline('[x](data:text/html,hi)').includes('<a '));
});

test('a quote in a link cannot break out of the attribute', () => {
  const html = Markdown.inline('[x](https://a.com/"onmouseover="alert(1))');
  assert.ok(!/onmouseover="/.test(html));
});

test('headings, rules, paragraphs and line breaks', () => {
  assert.equal(Markdown.render('## Título\n\nUna línea\notra'), '<h4>Título</h4><p>Una línea<br>otra</p>');
  assert.equal(Markdown.render('---'), '<hr>');
});

test('lists, ordered lists and nesting', () => {
  assert.equal(Markdown.render('- uno\n- dos'), '<ul><li>uno</li><li>dos</li></ul>');
  assert.equal(Markdown.render('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(Markdown.render('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
});

test('tables', () => {
  const html = Markdown.render('| Pieza | m² |\n|---|---|\n| Sala | 20 |\n| Baño | 4 |');
  assert.match(html, /<th>Pieza<\/th><th>m²<\/th>/);
  assert.match(html, /<td>Sala<\/td><td>20<\/td>/);
});

test('code blocks keep their text and escape it', () => {
  assert.equal(Markdown.render('```\n<b>x</b>\n```'), '<pre><code>&lt;b&gt;x&lt;/b&gt;</code></pre>');
});

test('block quotes render their content', () => {
  assert.equal(Markdown.render('> **ojo**'), '<blockquote><p><strong>ojo</strong></p></blockquote>');
});

test('an unfinished code block does not swallow the page', () => {
  assert.match(Markdown.render('antes\n```\ncodigo'), /<p>antes<\/p><pre>/);
});
