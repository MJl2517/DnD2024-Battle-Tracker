import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@shared/schema';

export interface AppDatabase {
  sqlite: Database.Database;
  orm: BetterSQLite3Database<typeof schema>;
}

/**
 * Открывает пользовательскую базу и безопасно доводит её схему до текущей версии.
 * Файл хранится в каталоге Electron userData, поэтому обновление приложения не стирает кампании.
 */
export function openAppDatabase(userDataPath: string): AppDatabase {
  const databasePath = join(userDataPath, 'dnd-2024-battle-tracker.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);

  return {
    sqlite,
    orm: drizzle(sqlite, { schema })
  };
}

/** Создаёт изолированную SQLite в памяти для интеграционных тестов репозиториев. */
export function openMemoryDatabase(): AppDatabase {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return {
    sqlite,
    orm: drizzle(sqlite, { schema })
  };
}

/**
 * Создаёт отсутствующие таблицы и колонки без изменения уже сохранённых строк.
 * Здесь намеренно нет пересоздания таблиц: старые пользовательские базы должны открываться без сброса.
 */
function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_characters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      armor_class INTEGER NOT NULL,
      max_hp INTEGER NOT NULL,
      initiative_mod INTEGER NOT NULL,
      passive_perception INTEGER NOT NULL,
      active INTEGER NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creature_templates (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size TEXT NOT NULL,
      creature_type TEXT NOT NULL,
      alignment TEXT NOT NULL,
      armor_class INTEGER NOT NULL,
      initiative_mod INTEGER NOT NULL,
      initiative_score INTEGER NOT NULL,
      hit_points INTEGER NOT NULL,
      hit_dice TEXT NOT NULL,
      speeds TEXT NOT NULL,
      abilities_json TEXT NOT NULL,
      saving_throws_json TEXT NOT NULL,
      skills TEXT NOT NULL,
      vulnerabilities TEXT NOT NULL,
      resistances TEXT NOT NULL,
      immunities TEXT NOT NULL,
      condition_immunities TEXT NOT NULL,
      senses TEXT NOT NULL,
      languages TEXT NOT NULL,
      challenge_rating TEXT NOT NULL,
      xp INTEGER NOT NULL,
      proficiency_bonus INTEGER NOT NULL,
      traits_json TEXT NOT NULL,
      actions_json TEXT NOT NULL,
      image_url TEXT NOT NULL,
      token_url TEXT NOT NULL DEFAULT '',
      lair_name TEXT NOT NULL DEFAULT '',
      lair_description TEXT NOT NULL DEFAULT '',
      lair_html TEXT NOT NULL DEFAULT '',
      lair_effects_json TEXT NOT NULL DEFAULT '[]',
      source_url TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encounters (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encounter_creature_groups (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      template_id TEXT NOT NULL REFERENCES creature_templates(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      initiative_mode TEXT NOT NULL,
      initiative_advantage INTEGER NOT NULL DEFAULT 0,
      initiative_override INTEGER,
      hp_mode TEXT NOT NULL DEFAULT 'average',
      hp_override INTEGER,
      is_ally INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS encounter_player_settings (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES player_characters(id) ON DELETE CASCADE,
      participating INTEGER NOT NULL DEFAULT 1,
      initiative_advantage INTEGER NOT NULL DEFAULT 0,
      initiative_override INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(encounter_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS encounter_lairs (
      id TEXT PRIMARY KEY,
      encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      template_id TEXT REFERENCES creature_templates(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      initiative INTEGER NOT NULL DEFAULT 20,
      description TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      effects_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(encounter_id)
    );

    CREATE TABLE IF NOT EXISTS combat_sessions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      encounter_id TEXT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
      round INTEGER NOT NULL,
      status TEXT NOT NULL,
      active_combatant_id TEXT,
      total_xp INTEGER NOT NULL,
      xp_per_player INTEGER NOT NULL,
      xp_ally_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS combatants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
      template_id TEXT,
      player_id TEXT,
      name TEXT NOT NULL,
      side TEXT NOT NULL,
      is_ally INTEGER NOT NULL DEFAULT 0,
      armor_class INTEGER NOT NULL,
      base_armor_class INTEGER NOT NULL DEFAULT 0,
      max_hp INTEGER NOT NULL,
      base_max_hp INTEGER NOT NULL DEFAULT 1,
      current_hp INTEGER NOT NULL,
      temporary_hp INTEGER NOT NULL DEFAULT 0,
      initiative INTEGER NOT NULL,
      initiative_mod INTEGER NOT NULL,
      initiative_group_id TEXT,
      initiative_mode TEXT NOT NULL,
      turn_order INTEGER NOT NULL,
      effects_json TEXT NOT NULL,
      public_notes TEXT NOT NULL DEFAULT '',
      public_name_visible INTEGER NOT NULL DEFAULT 0,
      snapshot_json TEXT,
      defeated INTEGER NOT NULL,
      escaped INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_players_campaign ON player_characters(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_creatures_campaign ON creature_templates(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_encounters_campaign ON encounters(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_groups_encounter ON encounter_creature_groups(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_player_settings_encounter ON encounter_player_settings(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_lairs_encounter ON encounter_lairs(encounter_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_campaign_status ON combat_sessions(campaign_id, status);
    CREATE INDEX IF NOT EXISTS idx_combatants_session ON combatants(session_id);
  `);

  addColumnIfMissing(db, 'encounter_creature_groups', 'hp_mode', "TEXT NOT NULL DEFAULT 'average'");
  addColumnIfMissing(db, 'encounter_creature_groups', 'initiative_advantage', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'encounter_creature_groups', 'initiative_override', 'INTEGER');
  addColumnIfMissing(db, 'encounter_creature_groups', 'is_ally', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'player_characters', 'image_url', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'encounter_player_settings', 'participating', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'creature_templates', 'token_url', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'creature_templates', 'lair_name', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'creature_templates', 'lair_description', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'creature_templates', 'lair_html', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'creature_templates', 'lair_effects_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'encounter_lairs', 'effects_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'combatants', 'escaped', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'combatants', 'base_armor_class', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'combatants', 'base_max_hp', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing(db, 'combatants', 'temporary_hp', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'combatants', 'public_name_visible', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'combatants', 'is_ally', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'combat_sessions', 'xp_ally_count', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    UPDATE combatants SET base_armor_class = armor_class WHERE base_armor_class = 0;
    UPDATE combatants SET base_max_hp = max_hp WHERE base_max_hp = 1 AND max_hp <> 1;
  `);
  db.exec(`
    UPDATE encounter_creature_groups
    SET hp_mode = CASE WHEN hp_override IS NULL THEN 'average' ELSE 'fixed' END
    WHERE hp_mode IS NULL OR hp_mode = ''
  `);
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}
