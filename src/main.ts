// SPDX-License-Identifier: LicenseRef-zkasuran-SAND-1.0
import "./styles.css";
import { start } from "./app";
import "./views/site";
import "./views/store";

const root = document.getElementById("app");
if (root) start(root);
