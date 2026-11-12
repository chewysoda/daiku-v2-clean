import React from "react";
import ReactDOM from "react-dom/client";
// Fonts are bundled so the app never calls Google Fonts at runtime.
import "@fontsource-variable/fraunces/full.css";
import "@fontsource/dm-mono/latin-400.css";
import "@fontsource/dm-mono/latin-500.css";
import "./design/global.css";
import "./design/glass.css";
import { App } from "./app/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
