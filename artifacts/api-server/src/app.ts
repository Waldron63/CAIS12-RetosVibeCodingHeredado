import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { migrateLegacyOwners } from "./lib/owners";

migrateLegacyOwners();

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", (_req, res): void => {
  res.status(404).json({ error: "Endpoint no encontrado." });
});

const errorHandler: ErrorRequestHandler = (error, req, res, _next): void => {
  req.log.error({ err: error }, "Request failed");
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 600
      ? error.status
      : 500;
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : "Error interno del servidor.";
  res.status(status).json({ error: message });
};

app.use(errorHandler);

export default app;
