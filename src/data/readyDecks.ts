// Built-in presets store shareable deck data and a card-back ID, never a second card list.
export const READY_DECKS = [
  {
    name: '守序中立',
    cardBackId: 'cardback-012',
    description: '您的卡组满是与中立指令配合的组件。您有多种方式生成中立卡牌，还能利用神圣男孩步兵团和皇家萨塞克斯团等牌赚取收益。通用载具协助润滑联动，而直布罗陀巨岩和警察辅助信使队则能提供另一种破局之道。在有能力持续赚取收益之前，您有大量守护单位帮你苟活。\n您的法国盟友将额外提供大量守护与过牌，外加 B1 重型坦克 II 型等大牌帮您终结游戏。最后，喀里多尼亚归附的使用时机十分灵活，可有效对抗快攻战术。',
    code: '%%26|191a2H2i2yDQDSsRtXyE;DTwcyGyNyOySzB;DDDRDVtTyH;',
  },
  {
    name: '汝即军团',
    cardBackId: 'cardback-050',
    description: '您的卡组是久经考验的情报军团流派，持久强悍，和谁都能过两招。老组件可不能少，比如塔尔努夫第 16 步兵团和雷兵团，而新加入的搜索第七联队则提供了一种更为廉价的情报触发方式。J2M 雷电局地战和老牌宇都宫联队将一同限制对手的指令发挥；而猛袭和最后一搏则能提供额外的解场选项。\n您的波兰盟友会提供军团组件，低费有第 28 步兵团，高费有第 15 狼步兵团，满足多层级战斗需求。',
    code: '%%38|6C6y7dE7E8EaflihtCtyu2uywXzi;E5g3iDiwtGtKu9x0zm;it;E9',
  },
  {
    name: '冬日游戏',
    cardBackId: 'cardback-058',
    description: '苏联与芬兰携手结盟，意欲执掌战场之局。卡组关键并非快速获胜，而是控制敌人并将其粉碎。步兵第 75 团极难处理，可用于阻断，而泥泞季则能强势反推冒进泥潭的单位。步兵第 102 团乍一看平平无奇，但能很快形成战力，让敌人头疼不已。\n您的芬兰盟友能提供各方面支援，新地团拥有接管战局的威慑力，滑雪部队则能远距离牵制强敌。',
    code: '%%49|919aDZE0ngthwm;8UDWn8rMsjtlyQz4;7HDUDXz0;wo',
  },
  {
    name: '超杀行动',
    cardBackId: 'cardback-039',
    description: '这套卡组旨在平衡手牌与桌面上的行动。您有很多与行动花费相关的卡牌，尤其是蓝色军团和激励部队。他们能帮您抢占先机，压倒对手。卡兹曼团特别灵活，您可以将其用作轻巧的闪击单位，也可以故意提高其行动花费以获取收益。\n您的美国盟友将为您的整体战略提供各式组件，尤其是是强势的第 116 步兵团。它能将任何步兵变成恐怖战力，后劲十足。',
    code: '%%15|3Nbud3E1E3EbvWzd;3eDOgLvSwDxozazg;xp;qhtsz7',
  },
] as const;

export type ReadyDeck = typeof READY_DECKS[number];
