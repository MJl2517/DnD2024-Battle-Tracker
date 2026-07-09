import type { CombatEffect } from './types';

export interface StatusEffectDefinition {
  id: string;
  label: string;
  originalName: string;
  icon: string;
  ruling: string;
  public: boolean;
}

export const CONCENTRATION_STATUS_ID = 'concentrating';
export const UNCONSCIOUS_STATUS_ID = 'unconscious';
export const INCAPACITATED_STATUS_ID = 'incapacitated';
export const PRONE_STATUS_ID = 'prone';
export const UNCONSCIOUS_DEPENDENCY_STATUS_IDS = [UNCONSCIOUS_STATUS_ID, INCAPACITATED_STATUS_ID, PRONE_STATUS_ID] as const;

export const STATUS_EFFECTS: StatusEffectDefinition[] = [
  {
    id: UNCONSCIOUS_STATUS_ID,
    label: 'Бессознательный',
    originalName: 'Unconscious',
    icon: '/statuses/unconscious.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Бессознательный, на вас действуют следующие эффекты:\n\nБездеятельность. У вас есть состояния Недееспособный и Опрокинутый, и вы роняете всё, что держите. Когда ваше состояние Бессознательный заканчивается, вы остаётесь Опрокинутым.\n\nСкорость 0. Ваша Скорость равна 0 и не может быть увеличена.\n\nВлияние на атаки. Броски атаки по вам совершаются с Преимуществом.\n\nВлияние на спасброски. Вы автоматически проваливаете спасброски Силы и Ловкости.\n\nАвтоматические критические попадания. Все броски атаки, попадающие по вам, считаются Критическими попаданиями, если атакующий находится в пределах 5 футов от вас.\n\nНеосознанность. Вы не осознаете своё окружение.'
  },
  {
    id: 'frightened',
    label: 'Испуганный',
    originalName: 'Frightened',
    icon: '/statuses/frightened.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Испуганный, на вас действуют следующие эффекты:\n\nВлияние на атаки и проверки характеристик. Пока источник страха на линии вашего обзора, вы совершаете с Помехой проверки характеристик и броски атаки.\n\nНе можете приближаться. Вы не можете добровольно приближаться к источнику страха.'
  },
  {
    id: 'exhaustion',
    label: 'Истощение',
    originalName: 'Exhaustion',
    icon: '/statuses/exhaustion.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Истощения, на вас действуют следующие эффекты:\n\nУровни истощения. Это состояние складывается само с собой. Каждый раз, когда вы получаете это состояние, уровень Истощения увеличивается на 1. Когда уровень Истощения становится 6, вы умираете.\n\nВлияние на тесты к20. Когда вы совершаете Тест к20, результат броска уменьшается на уровень Истощения, умноженный на 2.\n\nСнижение скорости. Ваша Скорость снижается на уровень Истощения, умноженный на 5.\n\nСнятие уровней истощения. Когда вы завершаете Долгий отдых, уровень Истощения снижается на 1. Когда уровень Истощения снижается до 0, состояние на вас заканчивается.'
  },
  {
    id: 'invisible',
    label: 'Невидимый',
    originalName: 'Invisible',
    icon: '/statuses/invisible.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Невидимый, на вас действуют следующие эффекты:\n\nВнезапность. Если вы совершаете бросок Инициативы с состоянием Невидимый, то делаете это с Преимуществом.\n\nСкрытость. На вас не может влиять никакой эффект, требующий, чтобы его цель была видна, если только создатель такого эффекта не может каким-либо образом видеть вас. Всё несомое и носимое вами снаряжение также скрывается.\n\nВлияние на атаки. Броски атаки по вам совершаются с Помехой, а ваши броски атаки совершаются с Преимуществом, если только существо не может каким-либо образом видеть вас.'
  },
  {
    id: INCAPACITATED_STATUS_ID,
    label: 'Недееспособный',
    originalName: 'Incapacitated',
    icon: '/statuses/incapacitated.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Недееспособный, на вас действуют следующие эффекты:\n\nБездействие. Вы не можете совершать действия, Бонусные действия и Реакции.\n\nБез концентрации. Вы не можете Концентрироваться.\n\nБезмолвие. Вы не можете говорить.\n\nПотрясение. Если вы совершаете бросок Инициативы с состоянием Недееспособный, то делаете это с Помехой.'
  },
  {
    id: 'deafened',
    label: 'Оглохший',
    originalName: 'Deafened',
    icon: '/statuses/deafened.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Оглохший, на вас действует следующий эффект:\n\nНе можете слышать. Вы не можете слышать и автоматически проваливаете проверки характеристик, требующие слуха.'
  },
  {
    id: 'petrified',
    label: 'Окаменевший',
    originalName: 'Petrified',
    icon: '/statuses/petrified.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Окаменевший, на вас действуют следующие эффекты:\n\nНедееспособный. У вас есть состояние Недееспособный.\n\nСкорость 0. Ваша Скорость равна 0 и не может быть увеличена.\n\nВлияние на спасброски. Вы автоматически проваливаете спасброски Силы и Ловкости.\n\nВлияние на атаки. Броски атаки по вам совершаются с Преимуществом.\n\nСопротивление урону. У вас есть Сопротивление всему урону.\n\nИммунитет к отравлению. У вас есть Иммунитет к состоянию Отравленный.'
  },
  {
    id: PRONE_STATUS_ID,
    label: 'Опрокинутый',
    originalName: 'Prone',
    icon: '/statuses/prone.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Опрокинутый, на вас действуют следующие эффекты:\n\nОграниченное перемещение. Вы можете перемещаться только ползком, или вы можете потратить перемещение в размере, равном половине вашей Скорости (округляя вниз), чтобы подняться и таким образом окончить на себе это состояние. Вы не можете подняться, если ваша Скорость равна 0.\n\nВлияние на атаки. Вы совершаете с Помехой броски атаки. Броски атаки по вам совершаются с Преимуществом, если атакующий находится в пределах 5 футов от вас; броски атаки по вам совершаются с Помехой, если атакующий находится далее 5 футов от вас.'
  },
  {
    id: 'restrained',
    label: 'Опутанный',
    originalName: 'Restrained',
    icon: '/statuses/restrained.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Опутанный, на вас действуют следующие эффекты:\n\nСкорость 0. Ваша Скорость равна 0 и не может быть увеличена.\n\nВлияние на атаки. Ваши броски атаки совершаются с Помехой, а броски атаки по вам совершаются с Преимуществом.\n\nВлияние на спасброски. Вы совершаете с Помехой спасброски Ловкости.'
  },
  {
    id: 'blinded',
    label: 'Ослеплённый',
    originalName: 'Blinded',
    icon: '/statuses/blinded.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Ослеплённый, на вас действуют следующие эффекты:\n\nНе можете видеть. Вы не можете видеть и автоматически проваливаете проверки характеристик, требующие зрения.\n\nВлияние на атаки. Ваши броски атаки совершаются с Помехой, а броски атаки по вам совершаются с Преимуществом.'
  },
  {
    id: 'poisoned',
    label: 'Отравленный',
    originalName: 'Poisoned',
    icon: '/statuses/poisoned.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Отравленный, на вас действуют следующие эффекты:\n\nВлияние на атаки и проверки характеристик. Вы совершаете с Помехой броски атаки и проверки характеристик.'
  },
  {
    id: 'charmed',
    label: 'Очарованный',
    originalName: 'Charmed',
    icon: '/statuses/charmed.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Очарованный, на вас действуют следующие эффекты:\n\nНе можете вредить очаровавшему. Вы не можете атаковать очаровавшее вас существо или нацеливать на него наносящие урон способности и магические эффекты.\n\nСоциальное преимущество. Очаровавшее вас существо совершает с Преимуществом проверки характеристик при социальном взаимодействии с вами.'
  },
  {
    id: 'stunned',
    label: 'Ошеломлённый',
    originalName: 'Stunned',
    icon: '/statuses/stunned.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Ошеломлённый, на вас действуют следующие эффекты:\n\nНедееспособность. У вас есть состояние Недееспособный.\n\nВлияние на спасброски. Вы автоматически проваливаете спасброски Силы и Ловкости.\n\nВлияние на атаки. Броски атаки по вам совершаются с Преимуществом.'
  },
  {
    id: 'paralyzed',
    label: 'Парализованный',
    originalName: 'Paralyzed',
    icon: '/statuses/paralyzed.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Парализованный, на вас действуют следующие эффекты:\n\nНедееспособность. У вас есть состояние Недееспособный.\n\nСкорость 0. Ваша Скорость равна 0 и не может быть увеличена.\n\nВлияние на спасброски. Вы автоматически проваливаете спасброски Силы и Ловкости.\n\nВлияние на атаки. Броски атаки по вам совершаются с Преимуществом.\n\nАвтоматические критические попадания. Все броски атаки, попадающие по вам, считаются Критическими попаданиями, если атакующий находится в пределах 5 футов от вас.'
  },
  {
    id: 'grappled',
    label: 'Схваченный',
    originalName: 'Grappled',
    icon: '/statuses/grappled.svg',
    public: true,
    ruling:
      'Пока у вас есть состояние Схваченный, на вас действуют следующие эффекты:\n\nСкорость 0. Ваша Скорость равна 0 и не может быть увеличена.\n\nВлияние на атаки. Вы совершаете с Помехой броски атаки по всем целям, кроме той, что схватила вас.\n\nМожете быть перемещены. Схватившее вас существо может при своём перемещении тащить или нести вас; при этом каждый фут перемещения стоит на 1 фут больше, если только вы не Крошечного размера или на две размера меньше его.\n\nСм. также: Захват.'
  },
  {
    id: CONCENTRATION_STATUS_ID,
    label: 'Концентрация',
    originalName: 'Concentration',
    icon: '/statuses/concentrating.svg',
    public: true,
    ruling:
      'Метка концентрации. Используйте её, чтобы быстро видеть, кто сейчас поддерживает заклинание или эффект с концентрацией.\n\nЕсли существо теряет концентрацию, отключите эту метку кнопкой на карточке.'
  }
];

const STATUS_BY_ID = new Map(STATUS_EFFECTS.map((effect) => [effect.id, effect]));

export function getStatusEffectDefinition(statusId: string | undefined): StatusEffectDefinition | undefined {
  return statusId ? STATUS_BY_ID.get(statusId) : undefined;
}

export function expandStatusEffectIds(statusId: string): readonly string[] {
  return statusId === UNCONSCIOUS_STATUS_ID ? UNCONSCIOUS_DEPENDENCY_STATUS_IDS : [statusId];
}

export function addStatusEffects(
  effects: CombatEffect[],
  statusIds: readonly string[],
  createId: () => string
): CombatEffect[] {
  const nextEffects = [...effects];
  const existingStatusIds = new Set(nextEffects.map((effect) => effect.statusId).filter(Boolean));

  for (const statusId of statusIds) {
    if (existingStatusIds.has(statusId)) continue;
    const status = getStatusEffectDefinition(statusId);
    if (!status) continue;

    nextEffects.push({
      id: createId(),
      label: status.label,
      public: status.public,
      statusId: status.id
    });
    existingStatusIds.add(status.id);
  }

  return nextEffects;
}

export function removeStatusEffects(effects: CombatEffect[], statusIds: readonly string[]): CombatEffect[] {
  const statusIdsToRemove = new Set(statusIds);
  return effects.filter((effect) => !effect.statusId || !statusIdsToRemove.has(effect.statusId));
}
