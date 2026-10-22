/**
 * hook.test.js — 验证 main-world.js 的「响应体改写」管线
 *
 * 用一个最小化的假环境（假 document / 假 fetch）加载真实源码，
 * 检查：命中项被摘掉、豁免项保留、楼中楼预览单独处理、预览模式只统计不隐藏。
 *
 * 运行：node test/hook.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

function makeEnv(configJson) {
  const configEl = { textContent: JSON.stringify(configJson) };

  const documentStub = {
    cookie: 'DedeUserID=1000; other=1',
    getElementById(id) {
      return id === '__bcf-config' ? configEl : null;
    },
    addEventListener() {},
    dispatchEvent() {},
    documentElement: { setAttribute() {} }
  };

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Headers,
    Response,
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Set,
    RegExp,
    Error,
    Promise,
    document: documentStub
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  // 假 fetch：返回一段固定的评论 JSON
  let payload = null;
  sandbox.fetch = function fakeFetch() {
    const body = JSON.stringify(payload);
    return Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
  };

  vm.createContext(sandbox);

  for (const f of ['keywords.js', 'filter.js', 'main-world.js']) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }

  return {
    sandbox,
    setPayload(p) {
      payload = p;
    }
  };
}

function buildPayload() {
  return {
    code: 0,
    data: {
      // 置顶：默认豁免，即使开头是 @ 也要保留
      top_replies: [
        {
          rpid: 't1',
          member: { mid: 1 },
          content: { message: '@某人 置顶公告：本期内容说明', members: [{ mid: 9 }] }
        }
      ],
      replies: [
        // 鱼 1：开头 @ → 应被摘掉
        {
          rpid: 'f1',
          member: { mid: 100 },
          content: {
            message: '@_口口漫画_ 试过并失败的路才值得成卡，踩过一次的先别写。',
            members: [{ mid: 9 }]
          }
        },
        // 真人长评：应保留
        {
          rpid: 'h1',
          member: { mid: 101 },
          content: {
            message:
              '我自己用DSH做了一个踩坑台账插件，思路差不多，但是方式和你不一样，我的思路是可以踩坑但是不能重复踩坑',
            members: []
          }
        },
        // 鱼 2：无 @，靠 A 档关键词命中；带一条楼中楼预览
        {
          rpid: 'f2',
          member: { mid: 102 },
          content: {
            message: '数了一圈，原来我也是那条亲戚（尾巴一摆）',
            members: []
          },
          replies: [
            // 楼中楼真人回复：结构规则不生效，应保留
            {
              rpid: 'n1',
              member: { mid: 200 },
              content: {
                message: '回复 @此琴若时:哈哈这个真有意思',
                members: [{ mid: 9 }]
              }
            }
          ]
        },
        // 自己发的：豁免，应保留
        {
          rpid: 's1',
          member: { mid: 1000 },
          content: { message: '@某人 我自己发的评论', members: [{ mid: 9 }] }
        }
      ],
      hots: []
    }
  };
}

const DEFAULT_CONFIG = {
  enabled: true,
  blockAtPrefix: true,
  keywordEnabled: true,
  keywordsOnlyOnAt: true,
  keywordsInNested: true,
  exemptSelf: true,
  exemptPinned: true,
  previewOnly: false,
  keywords: []
};

function makeConfig(settings) {
  // 复用 keywords.js 的 resolveKeywords 得到真实词表
  const env = makeEnv(DEFAULT_CONFIG);
  const NS = env.sandbox.__BCF__;
  const cfg = Object.assign({}, DEFAULT_CONFIG, settings || {});
  cfg.keywords = NS.resolveKeywords(NS.DEFAULT_SETTINGS);
  return cfg;
}

async function callHook(env, url) {
  const res = await env.sandbox.fetch(url);
  const text = await res.text();
  return JSON.parse(text);
}

(async () => {
  let pass = 0;
  let fail = 0;
  const fails = [];

  function check(name, cond, detail) {
    if (cond) {
      pass++;
      console.log(`  ✅ ${name}`);
    } else {
      fail++;
      fails.push(name + (detail ? ` — ${detail}` : ''));
      console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  const REPLY_URL =
    'https://api.bilibili.com/x/v2/reply/wbi/main?oid=1&type=1&mode=3&w_rid=x&wts=1';

  // ── 用例 1：常规过滤 ────────────────────────────────────
  {
    const env = makeEnv(makeConfig());
    env.setPayload(buildPayload());
    const out = await callHook(env, REPLY_URL);
    const ids = out.data.replies.map((r) => r.rpid);

    console.log('用例 1：常规过滤');
    check('鱼 f1（开头@）被摘掉', !ids.includes('f1'), '实际: ' + ids.join(','));
    check('鱼 f2（A档关键词）被摘掉', !ids.includes('f2'), '实际: ' + ids.join(','));
    check('真人 h1 保留', ids.includes('h1'));
    check('自己发的 s1 保留', ids.includes('s1'));
    check('置顶 top_replies 保留', out.data.top_replies.length === 1);
    check('非目标字段 hots 仍存在', Array.isArray(out.data.hots));
  }

  // ── 用例 2：楼中楼预览中的真人回复不误杀 ────────────────
  {
    const env = makeEnv(makeConfig({ keywordEnabled: false }));
    const payload = buildPayload();
    // 只留 f2 及其楼中楼，便于观察
    payload.data.replies = payload.data.replies.filter((r) => r.rpid === 'f2');
    payload.data.replies[0].content.message = '一条普通的评论';
    env.setPayload(payload);
    const out = await callHook(env, REPLY_URL);
    const f2 = out.data.replies.find((r) => r.rpid === 'f2');
    console.log('用例 2：楼中楼不被结构规则误杀');
    check('f2 保留', !!f2);
    check('楼中楼 n1 保留', f2 && f2.replies.some((r) => r.rpid === 'n1'));
  }

  // ── 用例 3：预览模式只统计不隐藏 ────────────────────────
  {
    const env = makeEnv(makeConfig({ previewOnly: true }));
    env.setPayload(buildPayload());
    const out = await callHook(env, REPLY_URL);
    const ids = out.data.replies.map((r) => r.rpid);
    const tally = env.sandbox.__BCF__.debug.getTally();

    console.log('用例 3：预览模式');
    check('全部评论仍在', ids.length === 4, '实际 ' + ids.length + ' 条');
    check('但已统计到命中', tally.at + tally.kw >= 2, `at=${tally.at} kw=${tally.kw}`);
  }

  // ── 用例 4：总开关关闭 ──────────────────────────────────
  {
    const env = makeEnv(makeConfig({ enabled: false }));
    env.setPayload(buildPayload());
    const out = await callHook(env, REPLY_URL);
    console.log('用例 4：总开关关闭');
    check('一条不少', out.data.replies.length === 4);
  }

  // ── 用例 5：非目标 URL 完全不动 ─────────────────────────
  {
    const env = makeEnv(makeConfig());
    env.setPayload(buildPayload());
    const out = await callHook(
      env,
      'https://api.bilibili.com/x/v2/reply/subject/description?oid=1'
    );
    console.log('用例 5：非目标接口不处理');
    check('原样返回', out.data.replies.length === 4);
  }

  // ── 用例 6：楼中楼接口（nested API）─────────────────────
  {
    const env = makeEnv(makeConfig());
    env.setPayload({
      code: 0,
      data: {
        root: { rpid: 'root' },
        replies: [
          {
            rpid: 'x1',
            member: { mid: 300 },
            content: {
              message: '@某人 楼中楼里以@开头也不该被结构规则砍',
              members: [{ mid: 9 }]
            }
          }
        ]
      }
    });
    const out = await callHook(
      env,
      'https://api.bilibili.com/x/v2/reply/reply?oid=1&root=1&type=1'
    );
    console.log('用例 6：楼中楼接口');
    check('结构规则不生效，评论保留', out.data.replies.length === 1);
  }

  console.log('');
  console.log(`通过 ${pass} / ${pass + fail}`);
  if (fail) {
    console.log('');
    for (const f of fails) console.log('FAIL: ' + f);
    process.exitCode = 1;
  }
})();
