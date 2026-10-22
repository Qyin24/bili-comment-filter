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

function makeReply(message, memberCount = 0, mid = 1000) {
  const members = [];
  for (let i = 0; i < memberCount; i++) members.push({ mid: 9000 + i });
  return {
    rpid: String(Math.random()).slice(2),
    member: { mid },
    content: { message, members }
  };
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
