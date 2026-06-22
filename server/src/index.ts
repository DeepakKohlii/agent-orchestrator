import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { router } from "./api/routes.js";
import { errorHandler } from "./api/errors.js";
import { isMockMode, canUseReal, effectiveProvider } from "./runtime.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) =>
  res.json({
    ok: true,
    llmProvider: effectiveProvider(),
    model: isMockMode() ? "mock" : config.llm.model,
    mockMode: isMockMode(),
    canUseReal: canUseReal(),
  }),
);

app.use("/api", router);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`▶  server on http://localhost:${config.port}`);
  console.log(`   LLM provider: ${config.llm.provider} (${config.llm.model})`);
});
