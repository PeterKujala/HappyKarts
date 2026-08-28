import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const kartboardState = sqliteTable('kartboard_state', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull(),
  stateJson: text('state_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
