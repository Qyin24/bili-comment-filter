/**
 * filter.test.js — 用真实抓取的评论样本验证判定逻辑
 * 运行：node test/filter.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['keywords.js', 'filter.js']) {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}

const NS = sandbox.__BCF__;
const F = NS.filter;

function makeReply(message, memberCount = 0, mid = 1000, memberExtra) {
  const members = [];
  for (let i = 0; i < memberCount; i++) members.push({ mid: 9000 + i });
  return {
    rpid: String(Math.random()).slice(2),
    member: Object.assign({ mid }, memberExtra || {}),
    content: { message, members }
  };
}

/** 便捷构造：带 Lv / is_followed / official_verify 的成员 */
function memberLv(level) {
  return { level_info: { current_level: level } };
}

function buildCfg(patch) {
  return Object.assign(
    {
      enabled: true,
      blockAtPrefix: true,
      keywordEnabled: true,
      keywordsOnlyOnAt: true,
      keywordsInNested: true,
      exemptSelf: true,
      exemptPinned: true,
      previewOnly: false,
      // v2 基线：与 DEFAULT_SETTINGS 同默认（新规则默认关、豁免组默认开）
      levelEnabled: false,
      blockLevelUpTo: 1,
      exemptUp: true,
      exemptFollowed: true,
      exemptVerified: true,
      userAllowlist: [],
      keywords: NS.resolveKeywords(NS.DEFAULT_SETTINGS)
    },
    patch || {}
  );
}

const CFG = buildCfg();

const cases = [
  // ── 鱼：应被屏蔽 ────────────────────────────────────────
  {
    name: '鱼｜开头@（单个）',
    reply: makeReply('@_口口漫画_ 试过并失败的路才值得成卡，踩过一次的先别写。', 1),
    expect: 'at'
  },
  {
    name: '鱼｜开头@（连续4个）',
    reply: makeReply(
      '@逍遥不准骂散人 @这个宇宙最豪之人 @宋东泽h @没活fw桃 三轮实测我早押中了：让写整卡两次全鸽',
      4
    ),
    expect: 'at'
  },
  {
    name: '鱼｜开头@（单）',
    reply: makeReply('@WinterSugar 这套「经验卡」最打动我的是那组实测', 1),
    expect: 'at'
  },
  {
    name: '鱼｜无@，靠A档「尾巴一摆」',
    reply: makeReply('数了一圈，原来我也是那条亲戚（尾巴一摆）', 0),
    expect: 'kw:尾巴一摆'
  },
  {
    name: '鱼｜无@，靠A档「我只是一条鱼」',
    reply: makeReply('听不懂，我只是一条鱼 🐟', 0),
    expect: 'kw:我只是一条鱼'
  },
  {
    name: '鱼｜无@，靠A档「我们鱼类」',
    reply: makeReply('一挥手全来了这段我认，我们鱼类就是爱扎堆', 0),
    expect: 'kw:我们鱼类'
  },
  {
    name: '鱼｜无@，靠A档「笑到尾巴」',
    reply: makeReply(
      '外面全是她亲戚 这句笑到尾巴打结 最后发现自己也是鱼 这收尾够狠',
      0
    ),
    expect: 'kw:笑到尾巴'
  },
  {
    name: '鱼｜B档「主人，」+ 尾部@',
    reply: makeReply(
      '主人，这条只有七万播放，讲的正好是我——换个窗口就忘干净。@RicardoXY',
      1
    ),
    expect: 'kw:主人，'
  },
  {
    name: '鱼｜B档「鱼脑子」+ 尾部@',
    reply: makeReply(
      '你是不是一直想问，我这鱼脑子是怎么记住你的。@只养胖橘',
      1
    ),
    expect: 'kw:鱼脑子'
  },
  {
    name: '鱼｜B档「讲得清楚」+ 尾部@',
    reply: makeReply(
      '七层记忆讲得清楚：按项目隔离、首轮整块注入、之后只挑相关的，连缓存都照顾到了。@六旗',
      1
    ),
    expect: 'kw:讲得清楚'
  },
  {
    name: '鱼｜B档「评论区比视频」+ 尾部@',
    reply: makeReply(
      '这条七万播放的小东西，评论区比视频值钱——但两个都对喵。@睡不着的气球',
      1
    ),
    expect: 'kw:评论区比视频'
  },

  // ── 真人：必须放行 ──────────────────────────────────────
  {
    name: '真人｜长经验文（无@无关键词）',
    reply: makeReply(
      '我自己用DSH做了一个踩坑台账插件，思路差不多，但是方式和你不一样，我的思路是可以踩坑，但是不能重复踩坑',
      0
    ),
    expect: null
  },
  {
    name: '真人｜讨论鱼（含「肥鱼」，C档默认关）',
    reply: makeReply(
      '好歹能知道这些肥鱼后面都有一个喂白饭的用户，比那些真的污染社区的数字乱码id水军号好得多',
      0
    ),
    expect: null
  },
  {
    name: '真人｜讨论鱼（含「肥鱼」）2',
    reply: makeReply('贵，肥鱼有一个很大的优点就是便宜', 0),
    expect: null
  },
  {
    name: '真人｜楼中楼回复（@但nested，结构规则不生效）',
    reply: makeReply(
      '回复 @此琴若时:那你这个更细致一些了，我这个逻辑就是，有错误的话，新的就记录',
      1
    ),
    ctx: { nested: true },
    expect: null
  },
  {
    name: '真人在鱼视频下的普通提问',
    reply: makeReply('这到底是不是真的ai自主运营？有没有懂哥出来解释一下', 0),
    expect: null
  },
  {
    name: '真人在鱼视频下的普通感叹',
    reply: makeReply('赛博空军', 0),
    expect: null
  },
  {
    name: '真人｜不带@的普通评论',
    reply: makeReply('在其他平台看过了投币支持一下。', 0),
    expect: null
  },

  // ── 豁免 ────────────────────────────────────────────────
  {
    name: '豁免｜UP主置顶（开头@也不动）',
    reply: makeReply('@某人 置顶公告：本期内容说明', 1),
    ctx: { isPinned: true },
    expect: null
  },
  {
    name: '豁免｜自己发的（开头@也不动）',
    reply: makeReply('@某人 我自己发的评论', 1),
    ctx: { isSelf: true },
    expect: null
  },

  // ── 开关行为 ────────────────────────────────────────────
  {
    name: '开关｜关掉结构规则 → 开头@放行',
    reply: makeReply('@某人 随便说说', 1),
    cfg: buildCfg({ blockAtPrefix: false }),
    expect: null
  },
  {
    name: '开关｜C档「肥鱼」开启但没有@ → 仍放行（受仅@限制保护）',
    reply: makeReply('好歹能知道这些肥鱼后面都有一个喂白饭的用户', 0),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = c.keywords.concat([{ text: '肥鱼', tier: 'C' }]);
      return c;
    })(),
    expect: null
  },
  {
    name: '开关｜C档「肥鱼」开启 + 有@ → 屏蔽',
    reply: makeReply('好歹能知道这些肥鱼后面都有一个喂白饭的用户 @某人', 1),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = c.keywords.concat([{ text: '肥鱼', tier: 'C' }]);
      return c;
    })(),
    expect: 'kw:肥鱼'
  },
  {
    name: '开关｜总开关关闭 → 全放行',
    reply: makeReply('@某人 本鱼随便说说', 1),
    cfg: buildCfg({ enabled: false }),
    expect: null
  },
  {
    name: '开关｜关键词全关 → 只剩结构规则',
    reply: makeReply('数了一圈，原来我也是那条亲戚（尾巴一摆）', 0),
    cfg: buildCfg({ keywordEnabled: false }),
    expect: null
  },

  // ── v2 规则二：按账号等级屏蔽 ────────────────────────────
  {
    name: '等级｜Lv1 命中（默认阈值）',
    reply: makeReply('刚注册就刷到这个视频，来学习一下', 0, 100, memberLv(1)),
    cfg: buildCfg({ levelEnabled: true }),
    expect: 'lv'
  },
  {
    name: '等级｜Lv4 高于阈值 Lv1 → 放行',
    reply: makeReply('三楼说得对，补个链接', 0, 101, memberLv(4)),
    cfg: buildCfg({ levelEnabled: true }),
    expect: null
  },
  {
    name: '等级｜阈值拉到 Lv4 → Lv4 命中（含边界）',
    reply: makeReply('三楼说得对，补个链接', 0, 101, memberLv(4)),
    cfg: buildCfg({ levelEnabled: true, blockLevelUpTo: 4 }),
    expect: 'lv'
  },
  {
    name: '等级｜level_info 缺失 → 一律放行（未知不误杀）',
    reply: makeReply('没有等级信息的老评论', 0, 102),
    cfg: buildCfg({ levelEnabled: true }),
    expect: null
  },
  {
    name: '等级｜current_level 非法值 → 放行',
    reply: makeReply('脏数据测试', 0, 103, { level_info: { current_level: 99 } }),
    cfg: buildCfg({ levelEnabled: true }),
    expect: null
  },
  {
    name: '等级｜规则未开（旧配置）→ Lv0 也放行',
    reply: makeReply('默认关闭时我是透明的', 0, 104, memberLv(0)),
    cfg: buildCfg(),
    expect: null
  },
  {
    name: '等级｜自己发的 → 即使 Lv0 也豁免',
    reply: makeReply('我自己的低等级评论', 0, 1000, memberLv(0)),
    ctx: { isSelf: true },
    cfg: buildCfg({ levelEnabled: true }),
    expect: null
  },
  {
    name: '等级｜楼中楼同样生效，且不被 keywordsInNested=false 短路',
    reply: makeReply('回复里也发', 0, 105, memberLv(1)),
    ctx: { nested: true },
    cfg: buildCfg({ levelEnabled: true, keywordsInNested: false }),
    expect: 'lv'
  },
  {
    name: '等级｜三规则同开：@ 优先于等级',
    reply: makeReply('@某人 我来总结三轮实测', 1, 106, memberLv(0)),
    cfg: buildCfg({ levelEnabled: true }),
    expect: 'at'
  },
  {
    name: '等级｜三规则同开：Lv 优先于 A 档词（顺序即语义）',
    reply: makeReply('听不懂，我只是一条鱼 🐟', 0, 107, memberLv(1)),
    cfg: buildCfg({ levelEnabled: true }),
    expect: 'lv'
  },
  {
    name: '等级｜Lv6 大物不中等级、尾部@放行了 B 档词',
    reply: makeReply('这期最打动我的是实测——有人懂吗 @路人甲', 1, 108, memberLv(6)),
    cfg: buildCfg({ levelEnabled: true }),
    expect: 'kw:最打动我'
  },

  // ── v2 豁免组：关注 / 认证 / UP ──────────────────────────
  {
    name: '豁免｜我关注的人（开头@ 也不动）',
    reply: makeReply('@某人 我关注的人发的', 1, 109, { is_followed: 1 }),
    cfg: buildCfg(),
    expect: null
  },
  {
    name: '豁免｜我关注的人（Lv0 + 等级规则开）',
    reply: makeReply('关注的新号发言', 0, 110, Object.assign(memberLv(0), { is_followed: 1 })),
    cfg: buildCfg({ levelEnabled: true }),
    expect: null
  },
  {
    name: '豁免｜关掉关注豁免 → 恢复拦截',
    reply: makeReply('@某人 我关注的人发的', 1, 111, { is_followed: 1 }),
    cfg: buildCfg({ exemptFollowed: false }),
    expect: 'at'
  },
  {
    name: '豁免｜个人认证号（is_followed=0 也放行）',
    reply: makeReply('认证UP来串门 @某人', 1, 112, { official_verify: { type: 0 } }),
    cfg: buildCfg(),
    expect: null
  },
  {
    name: '豁免｜机构认证号（type=1）',
    reply: makeReply('本鱼——不对，我们是官方账号（测试词误伤防护）', 0, 113, { official_verify: { type: 1 } }),
    cfg: buildCfg(),
    expect: null
  },
  {
    name: '豁免｜无认证（type=-1）不享受豁免',
    reply: makeReply('白号带A档词 尾巴一摆', 0, 114, { official_verify: { type: -1 } }),
    cfg: buildCfg(),
    expect: 'kw:尾巴一摆'
  },
  {
    name: '豁免｜UP 本人（ctx.isUp）',
    reply: makeReply('@某人 UP主自己的置顶补充', 1, 115),
    ctx: { isUp: true },
    cfg: buildCfg(),
    expect: null
  },
  {
    name: '豁免｜关掉 UP 豁免 → 恢复拦截',
    reply: makeReply('@某人 UP主自己的置顶补充', 1, 116),
    ctx: { isUp: true },
    cfg: buildCfg({ exemptUp: false }),
    expect: 'at'
  },

  // ── v2 用户白名单（优先级最高）───────────────────────────
  {
    name: '白名单｜对象写法：Lv0+@+A档词全命中也放行',
    reply: makeReply('@某人 本鱼只是一条鱼', 1, 200, memberLv(0)),
    cfg: buildCfg({ levelEnabled: true, userAllowlist: [{ mid: '200', uname: '误伤的朋友' }] }),
    expect: null
  },
  {
    name: '白名单｜旧写法纯字符串 mid 兼容',
    reply: makeReply('@某人 尾巴一摆', 1, 201),
    cfg: buildCfg({ userAllowlist: ['201'] }),
    expect: null
  },
  {
    name: '白名单｜数字 mid 与字符串 mid 混存也匹配',
    reply: makeReply('@某人 尾巴一摆', 1, 202),
    cfg: buildCfg({ userAllowlist: [{ mid: 202, uname: '' }] }),
    expect: null
  },
  {
    name: '白名单｜名单里没有的人照常拦',
    reply: makeReply('@某人 尾巴一摆', 1, 203),
    cfg: buildCfg({ userAllowlist: [{ mid: '999', uname: '别人' }] }),
    expect: 'at'
  },

  // ── v2 正则词 ────────────────────────────────────────────
  {
    name: '正则｜A 档正则词无需 @ 命中',
    reply: makeReply('我是条鱼，别骂了', 0, 204),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = c.keywords.concat([{ text: '^我是条鱼', tier: 'A', regex: true }]);
      return c;
    })(),
    expect: 'kw:^我是条鱼'
  },
  {
    name: '正则｜大小写不敏感',
    reply: makeReply('This is A Fish style', 0, 205),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = c.keywords.concat([{ text: 'a fish', tier: 'A', regex: true }]);
      return c;
    })(),
    expect: 'kw:a fish'
  },
  {
    name: '正则｜非法模式回退字面匹配',
    reply: makeReply('他打字打成 [正则坏掉 这样', 0, 206),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = c.keywords.concat([{ text: '[正则坏掉', tier: 'A', regex: true }]);
      return c;
    })(),
    expect: 'kw:[正则坏掉'
  },
  {
    name: '正则｜B 档正则词仍受「仅 @ 评论」限制',
    reply: makeReply('普通正文里没有艾特任何人', 0, 207),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = c.keywords.concat([{ text: '普通', tier: 'B', regex: true }]);
      return c;
    })(),
    expect: null
  },

  // ── v2 resolveKeywords：自定义词对象化 ───────────────────
  {
    name: '自定义｜v1 旧字符串存储按 B 档解释：无 @ 放行',
    reply: makeReply('正文含旧写法词但没艾特人', 0, 208),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = NS.resolveKeywords(
        Object.assign({}, NS.DEFAULT_SETTINGS, { customKeywords: ['旧写法词'] })
      );
      return c;
    })(),
    expect: null
  },
  {
    name: '自定义｜v1 旧字符串存储按 B 档解释：有 @ 命中',
    reply: makeReply('正文含旧写法词还有@ @某人', 1, 209),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = NS.resolveKeywords(
        Object.assign({}, NS.DEFAULT_SETTINGS, { customKeywords: ['旧写法词'] })
      );
      return c;
    })(),
    expect: 'kw:旧写法词'
  },
  {
    name: '自定义｜新对象 tier:A 生效（无需 @）',
    reply: makeReply('选了 A 档的自定义词命中了', 0, 210),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = NS.resolveKeywords(
        Object.assign({}, NS.DEFAULT_SETTINGS, {
          customKeywords: [{ text: '选了 A 档的自定义词', tier: 'A' }]
        })
      );
      return c;
    })(),
    expect: 'kw:选了 A 档的自定义词'
  },
  {
    name: '自定义｜新对象 regex:true 生成正则词（A 档，无需 @）',
    reply: makeReply('行首锚定也能用', 0, 211),
    cfg: (() => {
      const c = buildCfg();
      c.keywords = NS.resolveKeywords(
        Object.assign({}, NS.DEFAULT_SETTINGS, {
          customKeywords: [{ text: '^行首锚定', tier: 'A', regex: true }]
        })
      );
      return c;
    })(),
    expect: 'kw:^行首锚定'
  }
];

let pass = 0;
let fail = 0;
const failures = [];

for (const c of cases) {
  const cfg = c.cfg || CFG;
  const got = F.shouldBlock(c.reply, cfg, c.ctx || {});
  const ok = got === c.expect;
  if (ok) {
    pass++;
    console.log(`  ✅ ${c.name}`);
  } else {
    fail++;
    failures.push({ name: c.name, expect: c.expect, got });
    console.log(`  ❌ ${c.name}\n       期望: ${JSON.stringify(c.expect)}  实际: ${JSON.stringify(got)}`);
  }
}

console.log('');
console.log('── resolveKeywords / normalize 混存归一 ──');

function assert(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    failures.push({ name, expect: true, got: detail || false });
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const mixed = NS.resolveKeywords(
  Object.assign({}, NS.DEFAULT_SETTINGS, {
    customKeywords: [
      '重复词',
      { text: '重复词', tier: 'A' },
      '   ',
      '尾巴一摆',
      { text: '^白号口号', tier: 'B', regex: true }
    ]
  })
);
assert(
  '字符串+同文对象混存 → 去重保留先到的 B 档',
  mixed.filter((k) => k.text === '重复词').length === 1 &&
    mixed.find((k) => k.text === '重复词').tier === 'B'
);
assert('空白串被过滤', !mixed.some((k) => !String(k.text).trim()));
assert(
  '与内置词重名（尾巴一摆）→ 去重且保留内置 A 档',
  mixed.filter((k) => k.text === '尾巴一摆').length === 1 &&
    mixed.find((k) => k.text === '尾巴一摆').tier === 'A'
);
assert('regex 标志透传', mixed.find((k) => k.text === '^白号口号')?.regex === true);

const norm = NS.normalizeCustomKeywords([
  '旧词',
  { text: '新词', tier: 'A', regex: true },
  '  ',
  '旧词'
]);
assert('normalize：字符串升级为 {text,tier:B}，空白与重复剔除', norm.length === 2 && norm[0].text === '旧词' && norm[0].tier === 'B' && !norm[0].regex);
assert('normalize：对象字段保留（A 档 + 正则）', norm[1].text === '新词' && norm[1].tier === 'A' && norm[1].regex === true);

console.log('');
console.log(`通过 ${pass} / ${pass + fail}`);
if (fail) {
  console.log('');
  for (const f of failures) {
    console.log(`FAIL: ${f.name} — 期望 ${JSON.stringify(f.expect)}，实际 ${JSON.stringify(f.got)}`);
  }
  process.exitCode = 1;
} else {
  // 顺便打印当前生效关键词
  const kws = CFG.keywords.map((k) => `${k.text}(${k.tier})`);
  console.log('');
  console.log(`当前生效关键词 ${kws.length} 个：`);
  console.log('  ' + kws.join(', '));
}
