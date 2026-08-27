import type { Migration } from "../migration-runner";
import { initSchemaMigration } from "./0001-init";

/** Ordered list of every migration. Append new migrations at the end with the next version number. */
export const backlogMigrations: Migration[] = [initSchemaMigration];
