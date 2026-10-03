import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "./styles.css";
import "./chrome.css";
import { startApp } from "./app";

startApp(document.querySelector<HTMLElement>("#app")!);
