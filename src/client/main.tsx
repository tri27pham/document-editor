import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initCssVars } from "./initCssVars";
import "./styles.css";

initCssVars();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found.");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
