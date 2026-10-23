/**
 * server.js — 仅用于本地预览界面（不参与扩展运行）
 *
 * 直接服务 src/ 下的真实 HTML，并在 ?preview=1 时注入一个 chrome.* 桩，
 * 这样预览的是「真正会发布的那份文件」，不用维护一份重复的预览版。
 *
 * 用法：node preview/server.js [port]
 *   http://127.0.0.1:8787/src/options.html?preview=1
 *   http://127.0.0.1:8787/src/options.html?preview=1&theme=light
 *   http://127.0.0.1:8787/src/popup.html?preview=1&theme=light
 *
 *   ?theme=light|dark|auto  固定主题，方便截图对照
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8787);

/** 版本唯一来源：manifest.json（v2：桩不再手抄版本号） */
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

/**
 * 生成注入用的 chrome.* 桩
 * @param {Record<string,string>} query
 * @returns {string}
 */
function makeStub(query) {
  const allowed = ['light', 'dark', 'auto'];
  const theme = query && allowed.includes(query.theme) ? query.theme : null;
  const seed = theme ? 'store.theme = ' + JSON.stringify(theme) + ';' : '';
  const fakeDegraded = !!(query && query.degraded === '1');

  return [
    '<script>',
    '(function(){',
    '  var store = {};',
    '  var listeners = [];',
    '  ' + seed,
    '  window.chrome = {',
    '    storage: {',
    '      local: {',
    '        get: function (keys, cb) {',
    '          setTimeout(function(){ cb(Object.assign({}, store)); }, 0);',
    '        },',
    '        set: function (v, cb) {',
    '          Object.assign(store, v);',
    '          listeners.forEach(function (fn) { try { fn({}, "local"); } catch (e) {} });',
    '          if (cb) setTimeout(cb, 0);',
    '        }',
    '      },',
    '      onChanged: { addListener: function (fn) { listeners.push(fn); } }',
    '    },',
    '    runtime: {',
    `      getManifest: function () { return { version: ${JSON.stringify(MANIFEST.version)} }; },`,
    '      openOptionsPage: function () {},',
    '      sendMessage: function (msg, cb) {',
    `        if (cb) setTimeout(function () { cb({ ok: true, degraded: ${String(fakeDegraded)} }); }, 0);`,
    '      }',
    '    },',
    '    tabs: {',
    '      query: function (q, cb) { setTimeout(function () { cb([{ id: 1 }]); }, 0); }',
    '    }',
    '  };',
    '  window.__BCF_PREVIEW__ = {',
    '    getStore: function () { return Object.assign({}, store); }',
    '  };',
    '})();',
    '</script>'
  ].join('\n');
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsed.pathname || '/');
  if (pathname === '/') pathname = '/src/options.html';

  const full = path.join(ROOT, pathname);
  if (!full.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found: ' + pathname);
      return;
    }

    const ext = path.extname(full).toLowerCase();
    let body = data;

    if (ext === '.html' && parsed.query && parsed.query.preview === '1') {
      const html = data.toString('utf8');
      const stub = makeStub(parsed.query);
      body = Buffer.from(
        html.includes('<head>') ? html.replace('<head>', '<head>\n' + stub) : stub + html,
        'utf8'
      );
    }

    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`preview server on http://127.0.0.1:${PORT}/`);
  console.log(`  options(dark) : http://127.0.0.1:${PORT}/src/options.html?preview=1&theme=dark`);
  console.log(`  options(light): http://127.0.0.1:${PORT}/src/options.html?preview=1&theme=light`);
  console.log(`  popup(light)  : http://127.0.0.1:${PORT}/src/popup.html?preview=1&theme=light`);
  console.log(`  popup(degraded): http://127.0.0.1:${PORT}/src/popup.html?preview=1&degraded=1`);
  console.log(`  pill-demo     : http://127.0.0.1:${PORT}/preview/pill-demo.html?preview=1&theme=dark`);
});
