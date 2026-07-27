import { createApp, listen } from "./createApp.js";

const app = await createApp();
await listen(app);
