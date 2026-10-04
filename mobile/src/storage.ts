import { openDatabaseSync } from "expo-sqlite";
import { refreshWidgets } from "./widget";
import { openNotebook } from "./sqliteNotebook";
export function loadNotebook() {
  return openNotebook(openDatabaseSync("quicknote-mobile.db"), refreshWidgets);
}
