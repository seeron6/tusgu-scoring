import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "tusgu.db");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  seed(_db);
  return _db;
}

function initSchema(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS question_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      points_per_question INTEGER NOT NULL DEFAULT 0,
      max_questions INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      dob TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      centre TEXT NOT NULL,
      teacher TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_students_category ON students(category_id);
    CREATE INDEX IF NOT EXISTS idx_students_namedob ON students(first_name, last_name, dob);

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      question_type_id INTEGER NOT NULL REFERENCES question_types(id) ON DELETE CASCADE,
      value INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, question_type_id)
    );
    CREATE INDEX IF NOT EXISTS idx_scores_student ON scores(student_id);

    CREATE TABLE IF NOT EXISTS trophy_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT,
      description TEXT,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trophy_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trophy_type_id INTEGER NOT NULL REFERENCES trophy_types(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      UNIQUE(trophy_type_id, category_id)
    );
  `);
}

function seed(d: Database.Database) {
  const username = process.env.ADMIN_USERNAME || "tusguscore";
  const password = process.env.ADMIN_PASSWORD || "internalcomp26";

  const existing = d.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 12);
    d.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
  }

  const qtCount = d.prepare("SELECT COUNT(*) AS n FROM question_types").get() as { n: number };
  if (qtCount.n === 0) {
    const insertQT = d.prepare(
      "INSERT INTO question_types (name, points_per_question, max_questions, display_order) VALUES (?, ?, ?, ?)"
    );
    insertQT.run("Addition", 10, 10, 1);
    insertQT.run("Subtraction", 10, 10, 2);
    insertQT.run("Multiplication", 5, 20, 3);
    insertQT.run("Division", 5, 20, 4);
  }

  const ttCount = d.prepare("SELECT COUNT(*) AS n FROM trophy_types").get() as { n: number };
  if (ttCount.n === 0) {
    const insertTT = d.prepare(
      "INSERT INTO trophy_types (name, icon, description, display_order) VALUES (?, ?, ?, ?)"
    );
    insertTT.run("Gold Trophy", "🥇", "First place award", 1);
    insertTT.run("Silver Medal", "🥈", "Second place award", 2);
    insertTT.run("Bronze Certificate", "🥉", "Third place award", 3);
    insertTT.run("Participation Certificate", "🏅", "Recognition of participation", 4);
  }
}
