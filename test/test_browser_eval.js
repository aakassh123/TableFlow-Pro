import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

const createdElements = [];
const elementsById = {};

const regex = /id=["']([^"']+)["']/g;
let match;
while ((match = regex.exec(html)) !== null) {
  elementsById[match[1]] = {
    id: match[1],
    innerHTML: '',
    textContent: '',
    className: '',
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    style: {},
    dataset: {},
    appendChild: (el) => createdElements.push(el),
    addEventListener: () => {},
    querySelector: () => ({ textContent: '' }),
    querySelectorAll: () => [],
    value: '',
    checked: false
  };
}

const mockDoc = {
  getElementById: (id) => elementsById[id] || null,
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (tag) => ({
    tagName: tag,
    className: '',
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {},
    dataset: {},
    appendChild: () => {},
    addEventListener: () => {}
  }),
  addEventListener: () => {}
};

const mockWindow = {
  document: mockDoc,
  addEventListener: () => {},
  location: { protocol: 'http:', host: 'localhost:3000' },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  },
  setInterval: () => {},
  setTimeout: (fn) => setTimeout(fn, 1)
};

const context = vm.createContext({
  window: mockWindow,
  document: mockDoc,
  localStorage: mockWindow.localStorage,
  console: console,
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  WebSocket: class { addEventListener() {} },
  setTimeout: setTimeout,
  setInterval: () => {}
});

try {
  vm.runInContext(js, context);
  console.log('✓ app.js parsed and loaded into browser VM context cleanly!');
  
  // Now call initROS inside the VM context to test full bootstrap
  if (context.initROS) {
    context.initROS().then(() => {
      console.log('✓ initROS() executed successfully with all DOM calls!');
    }).catch(e => {
      console.error('❌ initROS error:', e);
      process.exit(1);
    });
  }
} catch (err) {
  console.error('❌ Error executing app.js:', err);
  process.exit(1);
}
