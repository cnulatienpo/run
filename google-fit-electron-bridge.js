#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { google } = require("googleapis");
const WebSocket = require("ws");

const SCOPES = ["https://www.googleapis.com/auth/fitness.activity.read"];
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.GOOGLE_FIT_POLL_INTERVAL_MS) || 10000;
const DEFAULT_WINDOW_MS = Number(process.env.GOOGLE_FIT_WINDOW_MS) || 60000;
const TOKEN_PATH = path.resolve(__dirname, "token.json");
const CREDENTIALS_PATH = path.resolve(__dirname, "credentials.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCredentials() {
  try {
    const content = await fs.promises.readFile(CREDENTIALS_PATH, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Unable to load OAuth credentials from ${CREDENTIALS_PATH}: ${error.message}`);
  }
}

async function loadSavedToken() {
  try {
    const token = await fs.promises.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(token);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Unable to read saved token file ${TOKEN_PATH}: ${error.message}`);
    }
    return null;
  }
}

async function saveToken(token) {
  try {
    await fs.promises.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log(`Saved OAuth token to ${TOKEN_PATH}`);
  } catch (error) {
    console.error(`Failed to save OAuth token: ${error.message}`);
  }
}

async function promptForCode(url) {
  console.log("Authorize this app by visiting this url:", url);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question("Enter the code from that page here: ", (code) => {
      rl.close();
      resolve(code.trim());
    });
  });
}

async function authorize() {
  const credentials = await loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web || {};

  if (!client_id || !client_secret || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    throw new Error("Invalid OAuth2 credentials: expected client_id, client_secret, and redirect_uris");
  }

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const token = await loadSavedToken();
  if (token) {
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  const code = await promptForCode(authUrl);
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  await saveToken(tokens);
  return oAuth2Client;
}

function extractStepsAndCadence(response, fallbackWindowMs) {
  let totalSteps = 0;
  let totalDurationMs = 0;

  const buckets = response.data?.bucket || [];
  for (const bucket of buckets) {
    for (const dataset of bucket.dataset || []) {
      for (const point of dataset.point || []) {
        const values = point.value || [];
        const value = values[0] || {};
        const steps = value.intVal ?? value.fpVal ?? 0;
        totalSteps += steps;

        if (point.startTimeNanos && point.endTimeNanos) {
          const startMs = Number(point.startTimeNanos) / 1e6;
          const endMs = Number(point.endTimeNanos) / 1e6;
          if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
            totalDurationMs += endMs - startMs;
          }
        }
      }
    }
  }

  if (totalDurationMs <= 0) {
    totalDurationMs = fallbackWindowMs;
  }

  const cadence = totalDurationMs > 0 ? Math.round((totalSteps / (totalDurationMs / 60000)) * 100) / 100 : 0;
  return { steps: totalSteps, cadence };
}

async function fetchStepSummary(auth, windowMs) {
  const fitness = google.fitness({ version: "v1", auth });
  const now = Date.now();
  const startTimeMillis = now - windowMs;

  try {
    const response = await fitness.users.dataset.aggregate({
      userId: "me",
      requestBody: {
        aggregateBy: [
          {
            dataTypeName: "com.google.step_count.delta",
            dataSourceId:
              "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
          },
        ],
        bucketByTime: {
          durationMillis: windowMs,
        },
        startTimeMillis,
        endTimeMillis: now,
      },
    });

    const { steps, cadence } = extractStepsAndCadence(response, windowMs);
    return {
      steps,
      cadence,
      timestamp: now,
    };
  } catch (error) {
    console.error("Failed to fetch step data from Google Fit:", error.message);
    throw error;
  }
}

function startWebSocketServer(port = 6789) {
  const wss = new WebSocket.Server({ port });

  wss.on("connection", (ws) => {
    console.log("WebSocket client connected");
    ws.on("close", () => console.log("WebSocket client disconnected"));
  });

  wss.on("error", (error) => {
    console.error("WebSocket server error:", error.message);
  });

  return wss;
}

function broadcast(wss, message) {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload, (err) => {
        if (err) {
          console.error("Failed to send message to client:", err.message);
        }
      });
    }
  }
}

async function run() {
  try {
    const auth = await authorize();
    const wss = startWebSocketServer();

    let isRunning = true;
    process.on("SIGINT", async () => {
      if (!isRunning) return;
      console.log("\nShutting down...");
      isRunning = false;
      wss.close(() => process.exit(0));
    });

    while (isRunning) {
      try {
        const summary = await fetchStepSummary(auth, DEFAULT_WINDOW_MS);
        broadcast(wss, summary);
        console.log(`Broadcast steps=${summary.steps}, cadence=${summary.cadence}, timestamp=${summary.timestamp}`);
      } catch (error) {
        console.error("Polling error (will retry):", error.message);
      }
      await sleep(DEFAULT_POLL_INTERVAL_MS);
    }
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exitCode = 1;
  }
}

run();
