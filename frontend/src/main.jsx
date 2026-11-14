import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { UserProvider } from "@/lib/UserContext";
import { PollingProvider } from "@/lib/PollingContext";
import "@fontsource-variable/atkinson-hyperlegible-next";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <UserProvider>
        <PollingProvider>
          <App />
        </PollingProvider>
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>
);
