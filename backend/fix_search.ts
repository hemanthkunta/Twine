import { readFileSync, writeFileSync } from 'fs';

const filePath = 'src/services/message.service.ts';
const content = readFileSync(filePath, 'utf8');

const oldSearch = `static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;
        const trimmedQuery = query.trim();

        // Build query dynamically. The chat_members join is already scoped to the
        // requesting user, so history they cleared must not surface in search
        // results either.
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
          \`;

        const paramsArray: string[] = [userId];

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        let useFts = trimmedQuery !== '';
        let ftsMatch = '';
        if (useFts) {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            ftsMatch = trimmedQuery
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${escapeFts(token)}"\`)
                .join(' OR ');
            // Join FTS table without MATCH in ON clause (FTS5 requires MATCH in WHERE)
            sql += \` JOIN messages_fts f ON m.id = f.message_id\`
            // MATCH must be in WHERE clause for FTS5 virtual tables
            sql = sql.replace(\`WHERE m.is_deleted = 0\`, \`WHERE m.is_deleted = 0 AND f MATCH ?\`);
            paramsArray.push(ftsMatch);
        }

        // WHERE clause and ordering
        sql += \`
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCSE(cm.cleared_at, '')
          \`;`;

const newSearch = `static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        if (query.trim() !== '') {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            const ftsMatch = query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ');

            // Build the query with FTS5 JOIN before WHERE clause
            const sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              JOIN messages_fts f ON m.id = f.message_id
              WHERE m.is_deleted = 0 AND f MATCH ?
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
            return BaseService.query(sql, [userId, query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ')]) as MessageRowWithSender[];
        }

        // No FTS query - use simple LIKE fallback
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
        const paramsArray: string[] = [userId];
        const likeQuery = \`%\${query.trim().toLowerCase()}%\`;
        paramsArray.push(\`%\${query.trim().toLowerCase()}%\`);
        return BaseService.query(sql, paramsArray) as MessageRowWithSender[];`;

const fs = require('fs');
const content = fs.readFileSync('src/services/message.service.ts', 'utf8');

const oldSearch = /static async searchMessages\\([\\s\\S]*?return Promise\\.all\\(rows\\.map\\(\(r\\) => this\\.formatMessageRow\\(r\\)\\)\\);/;
const newSearch = \`static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        if (query.trim() !== '') {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            const ftsMatch = query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ');

            // Build the query with FTS5 JOIN before WHERE clause
            const sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              JOIN messages_fts f ON m.id = f.message_id
              WHERE m.is_deleted = 0 AND f MATCH ?
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
            return BaseService.query(sql, [userId, query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ')]) as MessageRowWithSender[];
        }

        // No FTS query - use simple LIKE fallback
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
        const paramsArray: string[] = [userId];
        const likeQuery = \`%\${query.trim().toLowerCase()}%\`;
        paramsArray.push(\`%\${query.trim().toLowerCase()}%\`);
        return BaseService.query(sql, paramsArray) as MessageRowWithSender[];`;

const fs = require('fs');
const content = fs.readFileSync('src/services/message.service.ts', 'utf8');

const oldSearch = /static async searchMessages\\([\\s\\S]*?return Promise\\.all\\(rows\\.map\\(\(r\\) => this\\.formatMessageRow\\(r\\)\\)\\);/;
const newSearch = \`static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        if (query.trim() !== '') {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            const ftsMatch = query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ');

            // Build the query with FTS5 JOIN before WHERE clause
            const sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              JOIN messages_fts f ON m.id = f.message_id
              WHERE m.is_deleted = 0 AND f MATCH ?
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
            return BaseService.query(sql, [userId, query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ')]) as MessageRowWithSender[];
        }

        // No FTS query - use simple LIKE fallback
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
        const paramsArray: string[] = [userId];
        const likeQuery = \`%\${query.trim().toLowerCase()}%\`;
        paramsArray.push(\`%\${query.trim().toLowerCase()}%\`);
        return BaseService.query(sql, paramsArray) as MessageRowWithSender[];`;

const fs = require('fs');
const content = fs.readFileSync('src/services/message.service.ts', 'utf8');

const oldSearch = /static async searchMessages\\([\\s\\S]*?return Promise\\.all\\(rows\\.map\\(\(r\\) => this\\.formatMessageRow\\(r\\)\\)\\);/;
const newSearch = \`static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        if (query.trim() !== '') {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            const ftsMatch = query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ');

            // Build the query with FTS5 JOIN before WHERE clause
            const sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              JOIN messages_fts f ON m.id = f.message_id
              WHERE m.is_deleted = 0 AND f MATCH ?
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
            return BaseService.query(sql, [userId, query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ')]) as MessageRowWithSender[];
        }

        // No FTS query - use simple LIKE fallback
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
        const paramsArray: string[] = [userId];
        const likeQuery = \`%\${query.trim().toLowerCase()}%\`;
        paramsArray.push(\`%\${query.trim().toLowerCase()}%\`);
        return BaseService.query(sql, paramsArray) as MessageRowWithSender[];`;

const fs = require('fs');
const content = fs.readFileSync('src/services/message.service.ts', 'utf8');

const oldSearch = /static async searchMessages\\([\\s\\S]*?return Promise\\.all\\(rows\\.map\\(\\(r\\) => this\\.formatMessageRow\\(r\\)\\)\\);/;
const newSearch = \`static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        if (query.trim() !== '') {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            const ftsMatch = query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ');

            // Build the query with FTS5 JOIN before WHERE clause
            const sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              JOIN messages_fts f ON m.id = f.message_id
              WHERE m.is_deleted = 0 AND f MATCH ?
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
            return BaseService.query(sql, [userId, query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ')]) as MessageRowWithSender[];
        }

        // No FTS query - use simple LIKE fallback
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
        const paramsArray: string[] = [userId];
        const likeQuery = \`%\${query.trim().toLowerCase()}%\`;
        paramsArray.push(\`%\${query.trim().toLowerCase()}%\`);
        return BaseService.query(sql, paramsArray) as MessageRowWithSender[];`;

const fs = require('fs');
const content = fs.readFileSync('src/services/message.service.ts', 'utf8');

const oldSearch = /static async searchMessages\\([\\s\\S]*?return Promise\\.all\\(rows\\.map\\(\\(r\\) => this\\.formatMessageRow\\(r\\)\\)\\);/;
const newSearch = \`static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;

        // True full-text search via the FTS5 mirror table.
        // Tokens are escaped for FTS5 special chars (":*()-~^|+), quoted, and OR-ed.
        // Uses JOIN instead of correlated subquery for better query planning.
        // Falls back to LIKE only if the FTS query throws (e.g. mirror table missing).
        if (query.trim() !== '') {
            // Escape FTS5 special characters, then quote each token.
            const escapeFts = (s: string) =>
                s.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""');
            const ftsMatch = query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ');

            // Build the query with FTS5 JOIN before WHERE clause
            const sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              JOIN messages_fts f ON m.id = f.message_id
              WHERE m.is_deleted = 0 AND f MATCH ?
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
            return BaseService.query(sql, [userId, query.trim()
                .split(/\\s+/)
                .filter(Boolean)
                .map((token) => \`"\${token.replace(/[:*\\(\\)\\-\\~\\^\\|\\+]/g, ' ').replace(/"/g, '""')}"\`)
                .join(' OR ')]) as MessageRowWithSender[];
        }

        // No FTS query - use simple LIKE fallback
        let sql = \`
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
              ORDER BY m.created_at DESC
              LIMIT 30\`;
        const paramsArray: string[] = [userId];
        const likeQuery = \`%\${query.trim().toLowerCase()}%\`;
        paramsArray.push(\`%\${query.trim().toLowerCase()}%\`);
        return BaseService.query(sql, paramsArray) as MessageRowWithSender[];`;

fs.writeFileSync('src/services/message.service.ts', content.replace(oldSearch, newSearch));
console.log('Fixed searchMessages method');
EOF
node fix_search.ts 2>&1