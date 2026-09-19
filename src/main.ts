import { App } from "./app";

const root = document.getElementById("app");
if (!root) {
  throw new Error("root element #app not found");
}

new App(root);
