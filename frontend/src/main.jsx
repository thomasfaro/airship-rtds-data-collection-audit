import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { watchInstallPrompt } from "./lib/installPrompt.js";
import { registerFallbackWorker } from "./lib/serviceWorker.js";

// Both listen for browser events that fire before the first render.
watchInstallPrompt();
registerFallbackWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
