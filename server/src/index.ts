import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./api/routes.js";
import { errorHandler } from "./api/errors.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({ ok: true, llmProvider: config.llm.provider, model: config.llm.model }),
);

app.use("/api", router);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`▶  server on http://localhost:${config.port}`);
  console.log(`   LLM provider: ${config.llm.provider} (${config.llm.model})`);
});
