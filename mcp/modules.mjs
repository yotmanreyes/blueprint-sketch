// the editor's plain-script modules, loaded for use outside the browser
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = name => fs.readFileSync(fileURLToPath(new URL('../src/' + name, import.meta.url)), 'utf8');
export const Layout = new Function('module', read('layout.js') + ';return Layout')();
export const Catalog = new Function('module', read('catalog.js') + ';return Catalog')();
export const Levels = new Function('Layout', 'module', read('levels.js') + ';return Levels')(Layout);
export const Templates = new Function('Layout', 'Levels', 'module', read('templates.js') + ';return Templates')(Layout, Levels);
export const Quantities = new Function('Layout', 'Levels', 'module', read('quantities.js') + ';return Quantities')(Layout, Levels);
export const Agent = new Function('Layout', 'Levels', 'Catalog', 'Templates', 'Quantities', 'module', read('agent-tools.js') + ';return Agent')(Layout, Levels, Catalog, Templates, Quantities);
