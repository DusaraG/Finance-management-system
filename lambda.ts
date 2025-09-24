import { serverlessExpress } from "@vendia/serverless-express";
import app from "./server"; // your existing Express app

export const handler = serverlessExpress({ app });
