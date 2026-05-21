import { useEffect } from "react";
import { ShellStatus } from "./components/ShellStatus";
import { useOverlayCommands } from "./hooks/useOverlayCommands";

export default function App() {
  const { checkReady } = useOverlayCommands();

  useEffect(() => {
    void checkReady();
  }, [checkReady]);

  return <ShellStatus />;
}

