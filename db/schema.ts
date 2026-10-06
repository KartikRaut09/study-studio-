import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core';
export const studyProgress=sqliteTable('study_progress',{
 userId:text('user_id').notNull(),itemId:text('item_id').notNull(),kind:text('kind').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.itemId]})]);
