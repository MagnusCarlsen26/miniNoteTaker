import { openDatabaseSync } from "expo-sqlite";
import { openNotebook } from "./sqliteNotebook";
export function loadNotebook() {
  return openNotebook(openDatabaseSync("quicknote-mobile.db"));
}
