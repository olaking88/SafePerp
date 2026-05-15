import React from "react";
import ReactDOM from "react-dom/client";
import { AnimaProvider } from "@animaapp/playground-react-sdk";
import App from "./App";
import "./index.css";

function Root() {
  return (
    <AnimaProvider>
      <App />
    </AnimaProvider>
  );
}

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
