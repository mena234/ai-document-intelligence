import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
export const usageBuckets = sqliteTable('usage_buckets', {
  key: text('key').primaryKey(),
  window: integer('window').notNull(),
  count: integer('count').notNull(),
});
export const uploadedDocuments = sqliteTable(
  'uploaded_documents',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    digest: text('digest').notNull(),
    filename: text('filename').notNull(),
    byteSize: integer('byte_size').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    state: text('state').notNull(),
    content: text('content').notNull(),
  },
  (table) => [
    uniqueIndex('upload_owner_digest').on(table.owner, table.digest),
    index('upload_expiry').on(table.expiresAt),
  ],
);
