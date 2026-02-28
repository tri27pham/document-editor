import { Editor } from "./components/Editor";
import { Toolbar } from "./components/Toolbar";
import { PageOverlay } from "./components/PageOverlay";

export function App() {
  return (
    <div className="app">
      <Toolbar />
      <div className="editor-container">
        <PageOverlay pageCount={3} />
        <Editor />
      </div>
    </div>
  );
}
