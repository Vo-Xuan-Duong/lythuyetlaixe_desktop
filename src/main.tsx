import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/global.css";
import "./styles/learning-session.css";
import "./styles/learning-catalog.css";
import "./styles/question-collection.css";
import "./styles/exam.css";
import "./styles/exam-review.css";
import "./styles/dataset-setup.css";
import "./styles/review-statistics.css";
import "./styles/settings.css";
import "./styles/settings-preferences.css";
import "./styles/traffic-signs.css";
import "./styles/traffic-sign-catalog.css";
import "./styles/mobile-navigation.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
