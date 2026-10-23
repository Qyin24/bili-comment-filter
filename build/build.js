#!/usr/bin/env node
/**
 * build/build.js — 清塘 v2 单源构建（零第三方依赖）
 *
 * 背景：v1 时代代词库/判定逻辑在扩展与油猴版各存一份，纯手工同步必然漂移。
 * v2 起：油猴 .user.js 是「构建产物」，由三部分拼装：
 *   1. 头部元数据块（版本等取自 manifest.json —— 版本号唯一来源）
 *   2. src/keywords.js + src/filter.js（与扩展运行时的字节一致）
 *   3. userscript/source/main.js（油猴专属 UI/管线，其中 __BCF_VERSION__ 被注入）
 *
 * 用法：
 *   node build/build.js           # 生成并写盘 userscript/bili-comment-filter.user.js
 *   node build/build.js --check   # 只校验已提交产物与源码是否一致（CI 用），不一致退出码 1
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'userscript', 'bili-comment-filter.user.js');

const CHECK = process.argv.includes('--check');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** 版本号唯一来源：manifest.json */
function manifest() {
  return JSON.parse(read('manifest.json'));
}

function banner(m) {
  return [
    '// ==UserScript==',
    `// @name         ${m.name}`,
    '// @namespace    https://github.com/Qyin24/bili-comment-filter',
    '// @homepageURL  https://github.com/Qyin24/bili-comment-filter',
    '// @supportURL   https://github.com/Qyin24/bili-comment-filter/issues',
    '// @license      MIT',
    `// @version      ${m.version}`,
    `// @description  ${m.description}`,
    '// @author       Qyin24',
    '// @match        https://www.bilibili.com/*',
    '// @run-at       document-start',
    '// @grant        none',
    '// @noframes',
    '// ==/UserScript==',
    '',
    '/**',
    ' * ⚠ 本文件是构建产物 —— 请勿直接编辑！',
    ' * 由 build/build.js 自动生成（npm run build）：',
    ' *   src/keywords.js（词库 / 默认设置，单源）',
    ' *   src/filter.js（判定逻辑，单源）',
    ` *   userscript/source/main.js（油猴专属 UI 与管线）`,
    ' * 要改逻辑/词库：改上述源码后重新 npm run build。',
    ' */',
    ''
  ].join('\n');
}

function section(title, code) {
  return `/* ═════════════════ ${title} ═════════════════ */\n${code.trimEnd()}\n`;
}

function generate() {
  const m = manifest();
  const keywords = read('src/keywords.js');
  const filter = read('src/filter.js');
  const main = read('userscript/source/main.js').replaceAll('__BCF_VERSION__', m.version);

  return (
    banner(m) +
    section('src/keywords.js（构建时内联 · 勿在此编辑）', keywords) +
    '\n' +
    section('src/filter.js（构建时内联 · 勿在此编辑）', filter) +
    '\n' +
    section('userscript/source/main.js（油猴专属）', main) +
    '\n'
  );
}

function main_() {
  const out = generate();

  if (CHECK) {
    let committed = null;
    try {
      committed = fs.readFileSync(OUT, 'utf8');
    } catch {
      /* 产物不存在 */
    }
    if (committed === out) {
      console.log('build:check ✓ 油猴产物与源码一致');
      return;
    }
    console.error('build:check ✗ 油猴产物与源码不一致，请运行 npm run build 并提交产物。');
    if (committed === null) {
      console.error('（产物文件不存在：userscript/bili-comment-filter.user.js）');
    } else {
      const a = committed.split('\n');
      const b = out.split('\n');
      let shown = 0;
      for (let i = 0; i < Math.max(a.length, b.length) && shown < 8; i++) {
        if (a[i] !== b[i]) {
          console.error(`  行 ${i + 1}: 提交=${JSON.stringify((a[i] || '').slice(0, 80))} 期望=${JSON.stringify((b[i] || '').slice(0, 80))}`);
          shown++;
        }
      }
    }
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, 'utf8');
  const lines = out.split('\n').length;
  console.log(`build ✓ userscript/bili-comment-filter.user.js（v${manifest().version}，${lines} 行）`);
}

main_();
