import { Editor } from "./components/Editor";
import { Toolbar } from "./components/Toolbar";

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <div className="editor-container">
        <Editor />
      </div>
    </div>
  );
}
