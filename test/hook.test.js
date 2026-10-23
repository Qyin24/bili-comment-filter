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

  const attrs = {};
  const documentStub = {
    cookie: 'DedeUserID=1000; other=1',
    getElementById(id) {
      return id === '__bcf-config' ? configEl : null;
    },
    addEventListener() {},
    dispatchEvent(e) {
      // 记录事件名，供断言
      (documentStub.__events = documentStub.__events || []).push(String(e && e.type));
    },
    documentElement: {
      setAttribute(k, v) {
        attrs[k] = v;
      },
      getAttribute(k) {
        return attrs[k] === undefined ? null : attrs[k];
      }
    }
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
    Event: class FakeEvent {
      constructor(type) {
        this.type = type;
      }
    },
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
      // UP 主信息（v2：豁免 UP 本人的数据来源）
      upper: { mid: 101 },
      // 置顶：默认豁免，即使开头是 @ 也要保留
      top_replies: [
        {
          rpid: 't1',
          member: { mid: 1, level_info: { current_level: 6 } },
          content: { message: '@某人 置顶公告：本期内容说明', members: [{ mid: 9 }] }
        }
      ],
      replies: [
        // 鱼 1：开头 @ → 应被摘掉
        {
          rpid: 'f1',
          member: { mid: 100, level_info: { current_level: 1 } },
          content: {
            message: '@_口口漫画_ 试过并失败的路才值得成卡，踩过一次的先别写。',
            members: [{ mid: 9 }]
          }
        },
        // 真人长评：Lv2，应保留（Lv≤1 默认阈值也轮不到它）
        {
          rpid: 'h1',
          member: { mid: 101, level_info: { current_level: 2 } },
          content: {
            message:
              '我自己用DSH做了一个踩坑台账插件，思路差不多，但是方式和你不一样，我的思路是可以踩坑但是不能重复踩坑',
            members: []
          }
        },
        // 鱼 2：无 @，靠 A 档关键词命中；带一条楼中楼预览
        {
          rpid: 'f2',
          member: { mid: 102, level_info: { current_level: 5 } },
          content: {
            message: '数了一圈，原来我也是那条亲戚（尾巴一摆）',
            members: []
          },
          replies: [
            // 楼中楼真人回复：结构规则不生效，应保留
            {
              rpid: 'n1',
              member: { mid: 200, level_info: { current_level: 6 } },
              content: {
                message: '回复 @此琴若时:哈哈这个真有意思',
                members: [{ mid: 9 }]
              }
            }
          ]
        },
        // 自己发的：豁免，应保留（即使 Lv0）
        {
          rpid: 's1',
          member: { mid: 1000, level_info: { current_level: 0 } },
          content: { message: '@某人 我自己发的评论', members: [{ mid: 9 }] }
        },
        // v2 新增：Lv0 白号普通发言——等级规则关时保留，开时被摘
        {
          rpid: 'f3',
          member: { mid: 103, level_info: { current_level: 0 } },
          content: { message: '刚注册就刷到了，来学习一下', members: [] }
        },
        // v2 新增：UP 本人的一级评论（开头@，但 mid===upper.mid → 豁免）
        {
          rpid: 'u1',
          member: { mid: 101, level_info: { current_level: 6 } },
          content: { message: '@提问的朋友 补充说明放这里', members: [{ mid: 9 }] }
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
  // 复用 keywords.js 的 resolveKeywords 得到真实词表；显式传入 keywords 时尊重传入值
  const env = makeEnv(DEFAULT_CONFIG);
  const NS = env.sandbox.__BCF__;
  const cfg = Object.assign({}, DEFAULT_CONFIG, settings || {});
  if (!settings || settings.keywords === undefined) {
    cfg.keywords = NS.resolveKeywords(NS.DEFAULT_SETTINGS);
  }
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
    check('等级规则未开：Lv0 的 f3 保留（默认关=零行为变化）', ids.includes('f3'));
    check('UP 本人 u1 保留（exemptUp 默认开，压过 @ 规则）', ids.includes('u1'));
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
    check('全部评论仍在', ids.length === 6, '实际 ' + ids.length + ' 条');
    check('但已统计到命中', tally.at + tally.kw >= 2, `at=${tally.at} kw=${tally.kw}`);
  }

  // ── 用例 4：总开关关闭 ──────────────────────────────────
  {
    const env = makeEnv(makeConfig({ enabled: false }));
    env.setPayload(buildPayload());
    const out = await callHook(env, REPLY_URL);
    console.log('用例 4：总开关关闭');
    check('一条不少', out.data.replies.length === 6);
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
    check('原样返回', out.data.replies.length === 6);
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

  // ── 用例 7：v2 等级规则端到端 ────────────────────────────
  {
    const env = makeEnv(
      makeConfig({ levelEnabled: true, blockLevelUpTo: 1 })
    );
    env.setPayload(buildPayload());
    const out = await callHook(env, REPLY_URL);
    const ids = out.data.replies.map((r) => r.rpid);
    const tally = env.sandbox.__BCF__.debug.getTally();

    console.log('用例 7：等级规则端到端');
    check('Lv0 的 f3 被摘掉', !ids.includes('f3'), '实际: ' + ids.join(','));
    check('Lv1 的鱼 f1 也被摘（原因为 @ 优先计入 at）', !ids.includes('f1'));
    check('Lv0 的自己 s1 仍豁免', ids.includes('s1'));
    check('Lv2 真人 h1 保留', ids.includes('h1'));
    check('UP 本人 u1 保留', ids.includes('u1'));
    check('lv 计数恰好 1', tally.lv === 1, `实际 lv=${tally.lv}`);
    check('at 计数为 1（f1）', tally.at === 1, `实际 at=${tally.at}`);
  }

  // ── 用例 8：v2 命中明细摘要 ──────────────────────────────
  {
    const env = makeEnv(makeConfig());
    env.setPayload(buildPayload());
    await callHook(env, REPLY_URL);
    const hits = env.sandbox.__BCF__.debug.getHits();

    console.log('用例 8：命中明细');
    check('记录到 2 条命中（f1 at、f2 kw）', hits.length === 2, '实际 ' + hits.length + ' 条');
    check('最新命中在首位（f2 在 f1 之后处理）', hits[0] && hits[0].rpid === 'f2', hits.map((h) => h.rpid).join(','));
    check('reason 字段正确', hits.some((h) => h.reason === 'at') && hits.some((h) => h.reason === 'kw:尾巴一摆'));
    check('摘要含 mid/uname/level/blocked', hits.every((h) => h.mid && 'level' in h && h.blocked === true));
    check('excerpt 截断 ≤ 40 字', hits.every((h) => String(h.excerpt).length <= 40));
  }

  // ── 用例 9：v2 用户白名单端到端 ──────────────────────────
  {
    const env = makeEnv(
      makeConfig({ userAllowlist: [{ mid: '100', uname: '误伤的朋友' }] })
    );
    env.setPayload(buildPayload());
    const out = await callHook(env, REPLY_URL);
    const ids = out.data.replies.map((r) => r.rpid);

    console.log('用例 9：用户白名单');
    check('白名单作者 f1（开头@）被保留', ids.includes('f1'));
    check('其他人的命中不受影响（f2 仍摘）', !ids.includes('f2'));
    const hits = env.sandbox.__BCF__.debug.getHits();
    check('白名单放行不产生命中记录', hits.every((h) => h.mid !== '100'));
  }

  // ── 用例 10：v2 结构自检 degraded ────────────────────────
  {
    const env = makeEnv(makeConfig());
    env.setPayload({ code: 0, data: { upper: { mid: 1 }, pager: { next: 0 } } });
    await callHook(env, REPLY_URL);
    await new Promise((r) => setTimeout(r, 250)); // 等 flushStats 节流定时器
    const isDegraded = env.sandbox.__BCF__.debug.isDegraded();
    let stats = {};
    try {
      stats = JSON.parse(
        env.sandbox.document.documentElement.getAttribute('data-bcf-stats') || '{}'
      );
    } catch {
      /* 忽略 */
    }

    console.log('用例 10：结构自检');
    check('code=0 但无任何评论数组 → degraded 置位', isDegraded === true);
    check('stats 通道带上 degraded', stats.degraded === true, JSON.stringify(stats));
  }

  // ── 用例 11：v2 正常响应不误报 degraded + hits/stats 通道 ─
  {
    const env = makeEnv(makeConfig({ levelEnabled: true }));
    env.setPayload(buildPayload());
    await callHook(env, REPLY_URL);
    await new Promise((r) => setTimeout(r, 250));
    let stats = {};
    let attrHits = [];
    try {
      stats = JSON.parse(
        env.sandbox.document.documentElement.getAttribute('data-bcf-stats') || '{}'
      );
      attrHits = JSON.parse(
        env.sandbox.document.documentElement.getAttribute('data-bcf-hits') || '[]'
      );
    } catch {
      /* 忽略 */
    }

    console.log('用例 11：stats/hits 通道');
    check('正常响应不误报 degraded', stats.degraded === false, JSON.stringify(stats));
    check('stats 含 lv 字段', stats.lv === 1, JSON.stringify(stats));
    check('DOM 属性通道带回命中摘要', Array.isArray(attrHits) && attrHits.length === 3, '实际 ' + attrHits.length);
    check('EVT_STATS 事件已派发', (env.sandbox.document.__events || []).includes('__bcf:stats'));
  }

  // ── 用例 12：楼中楼接口 degraded 判定不误报 ──────────────
  {
    const env = makeEnv(makeConfig());
    env.setPayload({
      code: 0,
      data: {
        root: { rpid: 'root' },
        replies: []
      }
    });
    const url = 'https://api.bilibili.com/x/v2/reply/reply?oid=1&root=1&type=1';
    await callHook(env, url);
    console.log('用例 12：楼中楼空数组不算失效');
    check('replies 为空数组仍属正常', env.sandbox.__BCF__.debug.isDegraded() === false);
  }

  console.log('');
  console.log(`通过 ${pass} / ${pass + fail}`);
  if (fail) {
    console.log('');
    for (const f of fails) console.log('FAIL: ' + f);
    process.exitCode = 1;
  }
})();
