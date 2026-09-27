import { db } from '../db/index.js';
import { getLogger } from '../services/logger.service.js';

const logger = getLogger();

/**
 * Base service class providing common database operations and error handling.
 * Services can extend this class or use these static methods to avoid repetitive code.
 */
export class BaseService {
  /**
   * Execute a query that returns multiple rows.
   * @param sql SQL query string
   * @param params Query parameters
   * @returns Array of results
   */
  static query<U = unknown>(sql: string, params: unknown[]): U[] {
    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params) as U[];
    } catch (error) {
      logger.error({
        msg: 'Database query failed:',
        sql,
        params,
        err: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute a query that returns a single row.
   * @param sql SQL query string
   * @param params Query parameters
   * @returns Single result or null
   */
  static queryOne<U = unknown>(sql: string, params: unknown[]): U | null {
    try {
      const stmt = db.prepare(sql);
      const result = stmt.get(...params);
      return result ? (result as U) : null;
    } catch (error) {
      logger.error({
        msg: 'Database queryOne failed:',
        sql,
        params,
        err: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute a modification query (INSERT, UPDATE, DELETE).
   * @param sql SQL query string
   * @param params Query parameters
   * @returns Object with changes count
   */
  static execute(sql: string, params: unknown[]): { changes: number } {
    try {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    } catch (error) {
      logger.error({
        msg: 'Database execute failed:',
        sql,
        params,
        err: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get the last inserted row ID from the previous operation.
   * Note: This should be called immediately after an INSERT operation.
   * @returns Last inserted row ID
   */
  static lastInsertRowid(): number {
    try {
      // This is a SQLite-specific function
      const result = db.prepare('SELECT last_insert_rowid() as lastInsertRowid').get();
      if (result && typeof result === 'object' && 'lastInsertRowid' in result) {
        return result.lastInsertRowid as number;
      }
      throw new Error('Failed to get last insert rowid');
    } catch (error) {
      logger.error({
        msg: 'Database lastInsertRowid failed:',
        err: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}