/**
 * The single source of truth for the database schema.
 *
 * `src/db/schema.sql` is a human-readable snapshot of this constant, kept in sync
 * automatically by `src/test/schema_consistency.test.ts` — if the two ever drift,
 * that test fails. It lives here (rather than being read from the .sql file at
 * runtime) so the compiled output in `dist/` is self-contained: `tsc` does not
 * copy non-TypeScript assets, and a missing file at boot would be a hard failure.
 *
 * Engine: SQLite (`node:sqlite`). Note that `node:sqlite` enables
 * `PRAGMA foreign_keys = 1` by default, so every `ON DELETE CASCADE` below is
 * live — see the `INSERT ... ON CONFLICT` comment in `seedInitialData`.
 */
export const SCHEMA_SQL = `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          phone_number TEXT UNIQUE NOT NULL,
          username TEXT UNIQUE,
          display_name TEXT NOT NULL,
          bio TEXT DEFAULT '',
          avatar_url TEXT,
          password_hash TEXT,
          is_2fa_enabled INTEGER DEFAULT 0,
          is_bot INTEGER DEFAULT 0,
          last_seen_at TEXT DEFAULT (datetime('now')),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_name TEXT NOT NULL,
          device_type TEXT NOT NULL,
          client_version TEXT,
          refresh_token_hash TEXT,
          push_token TEXT,
          ip_address TEXT,
          last_active_at TEXT DEFAULT (datetime('now')),
          created_at TEXT DEFAULT (datetime('now')),
          is_revoked INTEGER DEFAULT 0
        );

        -- Public halves of each user's E2EE identity keypair. The private half
        -- never leaves the client (it is stored in IndexedDB), so this table is
        -- safe to read by any authenticated user: it is a public directory.
        --
        -- NOTE: one row per USER, not per device. A second device for the same
        -- user overwrites the row, which is why real multi-device E2EE needs its
        -- own design (see TODO.md).
        CREATE TABLE IF NOT EXISTS identity_keys (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          public_key TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            endpoint TEXT NOT NULL UNIQUE,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Wrapped sender keys for group E2EE, one row per (sender, recipient).
        --
        -- A group has no single shared secret, so each member mints their own
        -- sender key and distributes a copy to every other member. Each copy is
        -- sealed to that recipient's identity key (ECDH + AES-GCM) *in the
        -- browser* before it is uploaded, so \`wrapped_key\` is an opaque blob: the
        -- server can store and route it but cannot read a single group message.
        --
        -- This replaces a previous shape that kept a plain \`chain_key_hex\` column
        -- plus \`iteration\`/\`signing_pub_key_hex\`. Storing the chain key in the
        -- clear would have handed the server every group's keys, which is the
        -- opposite of end-to-end encryption. The old table was never written to
        -- by any code path, so \`dropLegacyTables()\` in db/index.ts discards it.
        CREATE TABLE IF NOT EXISTS group_sender_keys (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
            sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            wrapped_key TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(chat_id, sender_id, recipient_id)
        );

        CREATE INDEX IF NOT EXISTS idx_group_sender_keys_recipient ON group_sender_keys(recipient_id, chat_id);

        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL DEFAULT 'DIRECT',
          title TEXT,
          description TEXT,
          avatar_url TEXT,
          creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          is_e2ee INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_members (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'MEMBER',
          permissions_bitmask INTEGER DEFAULT 0,
          last_read_message_id TEXT,
          unread_count INTEGER DEFAULT 0,
          is_muted INTEGER DEFAULT 0,
          cleared_at TEXT,
          joined_at TEXT DEFAULT (datetime('now')),
          UNIQUE(chat_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reply_to_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          type TEXT NOT NULL DEFAULT 'TEXT',
          content_text TEXT,
          ciphertext_payload TEXT,
          media_url TEXT,
          media_metadata TEXT,
          is_pinned INTEGER DEFAULT 0,
          is_edited INTEGER DEFAULT 0,
          edit_timestamp TEXT,
          is_deleted INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS message_receipts (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'SENT',
          timestamp TEXT DEFAULT (datetime('now')),
          UNIQUE(message_id, user_id, status)
        );

        CREATE TABLE IF NOT EXISTS message_reactions (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          emoji TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(message_id, user_id, emoji)
        );

        CREATE TABLE IF NOT EXISTS pinned_messages (
          chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          pinned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS blocked_users (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, blocked_user_id)
        );

        -- Polls persist in SQLite so they survive restarts (replacing the
        -- previous Redis/in-memory store). Options and votes are normalized:
        -- poll_options holds the choice text, poll_votes holds one row per
        -- (poll, voter) so a user can change their vote.
        CREATE TABLE IF NOT EXISTS polls (
          id TEXT PRIMARY KEY,
          question TEXT NOT NULL,
          is_anonymous INTEGER DEFAULT 0,
          is_quiz INTEGER DEFAULT 0,
          correct_option_id TEXT,
          explanation TEXT,
          total_votes INTEGER DEFAULT 0,
          closed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS poll_options (
          id TEXT PRIMARY KEY,
          poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          text TEXT NOT NULL,
          UNIQUE(poll_id, position)
        );

        CREATE TABLE IF NOT EXISTS poll_votes (
          poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
          option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY(poll_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);
        CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_option ON poll_votes(poll_id, option_id);

        -- Compound Indices for High-Throughput Queries
        CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_members_chat_user ON chat_members(chat_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_receipts_lookup ON message_receipts(message_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_reactions_lookup ON message_reactions(message_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_blocked_users_lookup ON blocked_users(user_id, blocked_user_id);

        -- Durable outbox for store-and-forward delivery (offline caching).
        --
        -- A row is enqueued when a message must reach a recipient that may be
        -- offline; it holds the exact serialized WSFrame to redeliver. The
        -- worker in services/outbox.service.ts claims due rows, hands them to
        -- a registered transport, retries failures with exponential backoff
        -- and jitter, and expires entries that were never delivered within
        -- the configured TTL.
        CREATE TABLE IF NOT EXISTS outbox_queue (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          temp_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 5,
          next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_error TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox_queue(status, next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_outbox_recipient_status ON outbox_queue(recipient_user_id, status);
        CREATE INDEX IF NOT EXISTS idx_outbox_chat_status ON outbox_queue(chat_id, status);

        -- Per-device sync cursor: a reconnecting device catches up from its
        -- last acked sequence number instead of silently missing everything
        -- that was sent while it was offline.
        CREATE TABLE IF NOT EXISTS device_sync_state (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_id TEXT NOT NULL,
          last_acked_seq INTEGER NOT NULL DEFAULT 0,
          last_delivered_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(user_id, device_id)
        );

        CREATE INDEX IF NOT EXISTS idx_device_sync_user_device ON device_sync_state(user_id, device_id);

`;

/**
 * Migrations applied to databases created by an earlier version of SCHEMA_SQL.
 *
 * Each statement is allowed to fail: on a fresh database the column or table
 * already exists, and SQLite has no `ADD COLUMN IF NOT EXISTS`. This is a
 * deliberate, if blunt, migration convention — see TODO.md for the plan to
 * replace it with a versioned migration runner.
 */
export const SCHEMA_MIGRATIONS: string[] = [
    'ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0',
    'ALTER TABLE messages ADD COLUMN is_pinned INTEGER DEFAULT 0',
    // Per-user "clear history" marker: messages at or before this timestamp are
    // hidden for this member only, leaving other members' copies intact.
    'ALTER TABLE chat_members ADD COLUMN cleared_at TEXT',

    // Offline caching & store-and-forward: durable outbox queue plus
    // per-device sync cursors. CREATE TABLE IF NOT EXISTS is a no-op on
    // databases created by the current SCHEMA_SQL and creates the tables on
    // any older database, which is why these entries never fail here.
    `CREATE TABLE IF NOT EXISTS outbox_queue (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      temp_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox_queue(status, next_attempt_at);`,
    `CREATE INDEX IF NOT EXISTS idx_outbox_recipient_status ON outbox_queue(recipient_user_id, status);`,
    `CREATE INDEX IF NOT EXISTS idx_outbox_chat_status ON outbox_queue(chat_id, status);`,
    `CREATE TABLE IF NOT EXISTS device_sync_state (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      last_acked_seq INTEGER NOT NULL DEFAULT 0,
      last_delivered_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, device_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_device_sync_user_device ON device_sync_state(user_id, device_id);`
];
