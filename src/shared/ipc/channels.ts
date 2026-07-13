/** Single source of truth for main/preload IPC channel names. */
export const IPC_CHANNELS = {
  update: {
    getStatus: 'update:get-status',
    check: 'update:check',
    download: 'update:download',
    install: 'update:install',
    statusEvent: 'update:status'
  },
  settings: {
    getPublicDisplay: 'settings:get-public-display',
    savePublicDisplay: 'settings:save-public-display'
  },
  campaign: {
    list: 'campaign:list',
    create: 'campaign:create',
    delete: 'campaign:delete',
    detail: 'campaign:detail'
  },
  player: { save: 'player:save', delete: 'player:delete' },
  creature: {
    import: 'creature:import-ruleholder',
    fetchSpell: 'spell:fetch-ruleholder',
    save: 'creature:save',
    delete: 'creature:delete'
  },
  encounter: {
    save: 'encounter:save',
    delete: 'encounter:delete',
    saveGroup: 'encounter-group:save',
    deleteGroup: 'encounter-group:delete',
    savePlayer: 'encounter-player:save',
    saveLair: 'encounter-lair:save',
    deleteLair: 'encounter-lair:delete'
  },
  combat: {
    start: 'combat:start',
    prepare: 'combat:prepare',
    confirmInitiative: 'combat:confirm-initiative',
    beginInitiativeExchange: 'combat:begin-initiative-exchange',
    swapInitiative: 'combat:swap-initiative',
    cancelInitiativeExchange: 'combat:cancel-initiative-exchange',
    preparationEvent: 'combat:preparation-event',
    cancelPreparation: 'combat:cancel-preparation',
    addCombatants: 'combat:add-combatants',
    get: 'combat:get',
    updateCombatant: 'combatant:update',
    reorderCombatants: 'combatant:reorder',
    setActiveCombatant: 'combatant:set-active',
    advanceTurn: 'combat:advance-turn',
    retreatTurn: 'combat:retreat-turn',
    endRound: 'combat:end-round',
    advanceRound: 'combat:advance-round',
    retreatRound: 'combat:retreat-round',
    complete: 'combat:complete',
    dismissXpAward: 'combat:dismiss-xp-award'
  },
  playerWindow: {
    open: 'player-window:open',
    view: 'player-window:view',
    viewEvent: 'player:view',
    showFeatureCard: 'player-window:show-feature-card',
    dismissFeatureCard: 'player-window:dismiss-feature-card'
  }
} as const;
