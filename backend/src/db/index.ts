// @ts-ignore
import { DatabaseSync, Statement } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { SCHEMA_SQL, SCHEMA_MIGRATIONS } from './schema.js';
// Import logger functions
import { getLogger } from '../services/logger.service.js';
const logger = getLogger();

// Ensure data directory exists
logger.debug('config.dbPath: %s', config.dbPath);
const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * Simple connection pool for SQLite DatabaseSync instances.
 * Since Node.js is single-threaded, we lease connections per operation
 * to allow interleaving of preparations and avoid blocking on long transactions.
 */
class PooledDatabase {
    private pool: DatabaseSync[];
    private readonly poolSize: number;
    private acquireIndex = 0; // round-robin

    constructor(connectionString: string, poolSize = 5) {
        this.poolSize = poolSize;
        this.pool = Array.from({ length: poolSize }, () => new DatabaseSync(connectionString));
        // Apply pragmas to each connection
        this.pool.forEach(db => {
            try {
                db.exec(`
                    PRAGMA journal_mode = WAL;
                    PRAGMA busy_timeout = 10000;
                    PRAGMA synchronous = NORMAL;
                    PRAGMA cache_size = -64000;
                    PRAGMA temp_store = MEMORY;
                `);
            } catch (err) {
                console.warn('Pragma tuning warning:', err);
            }
        });
    }

    /**
     * Lease a connection from the pool (round-robin).
     */
    private acquireConnection(): DatabaseSync {
        const conn = this.pool[this.acquireIndex];
        this.acquireIndex = (this.acquireIndex + 1) % this.poolSize;
        return conn;
    }

    /**
     * Prepare a statement using a leased connection.
     * The returned statement will automatically release the connection after execution.
     */
    prepare(sql: string): PooledStatement {
        const conn = this.acquireConnection();
        const stmt = conn.prepare(sql);
        return new PooledStatement(stmt, () => {
            // Release the connection back to the pool (no-op for round-robin, but we could do something if needed)
            // In our round-robin, we don't need to explicitly release because we keep the connection leased
            // until the statement is garbage collected? Actually, we want to release after each execution.
            // We'll handle release in the statement execution methods.
        });
    }

    /**
     * Execute a raw SQL string (for schema migrations, etc.)
     * Uses a leased connection and releases after.
     */
    exec(sql: string): void {
        const conn = this.acquireConnection();
        try {
            conn.exec(sql);
        } finally {
            // Connection is implicitly released (round-robin will lease next time)
        }
    }

    get(sql: string, params: unknown[] = []): unknown {
        return this.prepare(sql).get(...params);
    }

    all(sql: string, params: unknown[] = []): unknown[] {
        return this.prepare(sql).all(...params);
    }

    run(sql: string, params: unknown[] = []): { changes: number } {
        return this.prepare(sql).run(...params);
    }

    /**
     * Check database health using a leased connection.
     */
    checkDbHealth(): boolean {
        const conn = this.acquireConnection();
        try {
            const res = conn.prepare('SELECT 1 as healthy').get() as { healthy: number };
            return res && res.healthy === 1;
        } finally {
            // Connection released
        }
    }

    /**
     * Close all connections in the pool.
     */
    close(): void {
        this.pool.forEach(conn => {
            try {
                conn.close();
            } catch (e) {
                // Ignore errors during close
                console.warn('Error closing database connection:', e);
            }
        });
    }
}

/**
 * Wrapper around a Statement that manages connection leasing/release.
 */
class PooledStatement {
    private stmt: Statement;
    private releaseCallback: () => void;

    constructor(stmt: Statement, releaseCallback: () => void) {
        this.stmt = stmt;
        this.releaseCallback = releaseCallback;
    }

    get(...args: unknown[]): unknown {
        try {
            return this.stmt.get(...args);
        } finally {
            this.releaseCallback();
        }
    }

    all(...args: unknown[]): unknown[] {
        try {
            return this.stmt.all(...args);
        } finally {
            this.releaseCallback();
        }
    }

    run(...args: unknown[]): { changes: number } {
        try {
            return this.stmt.run(...args);
        } finally {
            this.releaseCallback();
        }
    }

    // Add other methods as needed (iterate, etc.)
    // For now, we only need get, all, run based on usage in the codebase.
}

/**
 * Initialize the database pool.
 */
export const db = new PooledDatabase(config.dbPath, 5);

/**
 * Check database health.
 */
export function checkDbHealth(): boolean {
    return db.checkDbHealth();
}

/**
 * Initialize the database schema and seed data.
 */
/**
 * Drop tables whose columns were redesigned.
 *
 * `CREATE TABLE IF NOT EXISTS` leaves an existing table exactly as it is, so a
 * changed column list only takes effect on a fresh database — on any existing one
 * the stale shape survives and every insert against it fails. `SCHEMA_MIGRATIONS`
 * cannot help here: it runs *after* the schema, so a `DROP` there would delete the
 * table that was just created.
 *
 * Dropping a table destroys its rows, so each entry is gated on the specific
 * legacy column and is only listed where the table was provably never written to.
 * `group_sender_keys` qualifies: its old `chain_key_hex` shape was referenced by
 * no code path in the repository.
 */
function dropLegacyTables(conn: DatabaseSync): void {
    const legacyShapes: Array<{ table: string; legacyColumn: string }> = [
        { table: 'group_sender_keys', legacyColumn: 'chain_key_hex' },
    ];

    for (const { table, legacyColumn } of legacyShapes) {
        const exists = conn
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
            .get(table) as { name: string } | undefined;
        if (!exists) continue;

        // PRAGMA cannot take a bound parameter; the identifier is a hardcoded
        // literal from the list above, never user input.
        const columns = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{
            name: string;
        }>;
        if (columns.some((c) => c.name === legacyColumn)) {
            conn.exec(`DROP TABLE ${table}`);
        }
    }
}

export function initDatabase(): void {
    // We'll use a direct connection for initialization to avoid pooling complexity
    const initDb = new DatabaseSync(config.dbPath);
    try {
        // Apply pragmas
        initDb.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 10000;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -64000;
            PRAGMA temp_store = MEMORY;
        `);

        // Remove tables whose *shape* was redesigned before creating the new one.
        dropLegacyTables(initDb);

        // Create tables if not exist. SCHEMA_SQL (src/db/schema.ts) is the single
        // source of truth; src/db/schema.sql is a snapshot of it that
        // schema_consistency.test.ts keeps honest.
        initDb.exec(SCHEMA_SQL);

        // Run migrations on existing databases safely. Each statement is expected
        // to fail on a database that already has the column.
        for (const migration of SCHEMA_MIGRATIONS) {
            try {
                initDb.exec(migration);
            } catch {}
        }

        seedInitialData(initDb);
    } finally {
        initDb.close(); // Close the initialization connection
    }
}

/**
 * Seed initial data.
 * @param db The database connection to use for seeding.
 */
function seedInitialData(db: DatabaseSync): void {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const defaultPasswordHash = bcrypt.hashSync('password123', 12);

    // 1. Seed Bot if not exists
    const aiBot = db.prepare('SELECT id FROM users WHERE id = ?').get('usr_ai_bot') as { id: string } | undefined;
    if (!aiBot) {
        db.prepare(
            `
          INSERT INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash, is_bot)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `
        ).run(
            'usr_ai_bot',
            '+00000000000',
            'aether_ai',
            'Aether AI Assistant 🤖',
            'Your built-in AI copilot for summaries, translations, smart replies, and instant search.',
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
            defaultPasswordHash
        );
    }

    const demoUsers = [
        {
            id: 'usr_alice_001',
            phone_number: '+12345678901',
            username: 'alice',
            display_name: 'Alice Walker',
            bio: 'Exploring real-time protocols & cryptography 🔐',
            avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        },
        {
            id: 'usr_bob_002',
            phone_number: '+12345678902',
            username: 'bob',
            display_name: 'Bob Vance',
            bio: 'Distributed Systems & P2P Mesh Architect ⚡',
            avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        },
        {
            id: 'usr_charlie_003',
            phone_number: '+12345678903',
            username: 'charlie',
            display_name: 'Charlie Smith',
            bio: 'Security Researcher & Cryptanalyst 🛡️',
            avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
        },
        {
            id: 'usr_diana_004',
            phone_number: '+12345678904',
            username: 'diana',
            display_name: 'Diana Prince',
            bio: 'Mobile App Lead & UX Specialist 📱',
            avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
        },
    ];

    // Must be an upsert, NOT "INSERT OR REPLACE".
    //
    // node:sqlite enables PRAGMA foreign_keys by default, and REPLACE resolves a
    // conflict by DELETING the existing row first. That delete cascades through
    // messages, chat_members, message_receipts, message_reactions and
    // user_sessions (all ON DELETE CASCADE on users.id) — so every server start
    // silently destroyed the demo users' messages, memberships, receipts and
    // sessions. ON CONFLICT DO UPDATE refreshes the profile fields in place and
    // leaves referential data intact.
    const upsertUserStmt = db.prepare(`
    INSERT INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      phone_number = excluded.phone_number,
      username = excluded.username,
      display_name = excluded.display_name,
      bio = excluded.bio,
      avatar_url = excluded.avatar_url,
      password_hash = excluded.password_hash,
      updated_at = datetime('now')
  `);

    for (const u of demoUsers) {
        upsertUserStmt.run(
            u.id,
            u.phone_number,
            u.username,
            u.display_name,
            u.bio,
            u.avatar_url,
            defaultPasswordHash
        );
    }

    // 2. Pre-seed Direct Chat (Alice & Bob)
    const directChatId = 'chat_alice_bob_101';
    db.prepare(
        `INSERT OR IGNORE INTO chats (id, type, title, is_e2ee) VALUES (?, 'DIRECT', ?, 0)`
    ).run(directChatId, 'Alice & Bob');
    db.prepare(
        `INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`
    ).run('cm_101_1', directChatId, 'usr_alice_001');
    db.prepare(
        `INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`
    ).run('cm_101_2', directChatId, 'usr_bob_002');

    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-5 minutes'))
  `
    ).run(
        'msg_alice_bob_001',
        directChatId,
        'usr_bob_002',
        'Hey Alice! Twine messenger is live and running. Real-time WebSockets, WebRTC, and E2EE are ready to test! 🚀'
    );

    logger.info('✅ Seeding complete: 2 accounts ready (Alice & Bob).');
}

// Close all connections in the pool on process exit
process.on('exit', () => {
    // Note: In a real application, you might want to close connections properly.
    // For simplicity, we rely on Node.js to close file descriptors.
});