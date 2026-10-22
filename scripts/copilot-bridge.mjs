#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import os from 'node:os';

const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || '127.0.0.1';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function extractJsonFromOutput(text) {
  const trimmed = (text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function runCopilotCommand(args, bearerToken, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (bearerToken && bearerToken.trim()) {
      env.COPILOT_GITHUB_TOKEN = bearerToken.trim();
    }

    const child = spawn('copilot', args, {
      cwd: os.tmpdir(),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Copilot CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function parseBearerToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/v1/models')) {
    const bearerToken = parseBearerToken(req);
    try {
      const versionRes = await runCopilotCommand(['--version'], bearerToken, 10000);
      const versionText = (versionRes.stdout || versionRes.stderr).trim();

      if (url.searchParams.get('checkAuth') === '1') {
        const authProbe = await runCopilotCommand(
          ['-p', 'Reply with OK', '-s', '--disable-client-telemetry'],
          bearerToken,
          25000
        );
        const combined = `${authProbe.stdout}\n${authProbe.stderr}`;
        if (
          authProbe.code !== 0 &&
          /No authentication information found|authenticate|login/i.test(combined)
        ) {
          sendJson(res, 401, {
            ok: false,
            bridge: 'copilot-cli',
            version: versionText,
            error: {
              message:
                "Copilot CLI bridge is running, but Copilot CLI is not authenticated. Run 'copilot login' in your terminal or paste a GitHub token into the API Key field.",
            },
          });
          return;
        }
      }

      sendJson(res, 200, {
        object: 'list',
        bridge: 'copilot-cli',
        version: versionText,
        data: [
          { id: 'auto', object: 'model' },
          { id: 'claude-sonnet-5.5', object: 'model' },
          { id: 'claude-sonnet-5', object: 'model' },
          { id: 'claude-opus-5.5', object: 'model' },
          { id: 'claude-opus-5', object: 'model' },
          { id: 'claude-haiku-5.5', object: 'model' },
          { id: 'claude-haiku-4.5', object: 'model' },
          { id: 'gpt-5.5', object: 'model' },
          { id: 'gpt-5.4', object: 'model' },
          { id: 'gpt-5.4-mini', object: 'model' },
          { id: 'gpt-5.3-codex', object: 'model' },
          { id: 'gpt-5-mini', object: 'model' },
          { id: 'gemini-3.8-flash', object: 'model' },
          { id: 'grok-4.7', object: 'model' },
        ],
      });
    } catch (err) {
      sendJson(res, 500, {
        error: {
          message:
            err instanceof Error
              ? `Failed to invoke copilot CLI: ${err.message}`
              : 'Failed to invoke copilot CLI',
        },
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    const bearerToken = parseBearerToken(req);
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const body = JSON.parse(rawBody || '{}');
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const model = typeof body.model === 'string' && body.model ? body.model : 'auto';

        const promptText = messages
          .map((m) => `${String(m.role || 'user').toUpperCase()}:\n${String(m.content || '')}`)
          .join('\n\n');

        const baseArgs = [
          '-p',
          promptText,
          '-s',
          '--disable-client-telemetry',
          '--disallow-temp-dir',
        ];
        const args =
          model && model !== 'auto'
            ? [...baseArgs, '--model', model]
            : baseArgs;

        let result = await runCopilotCommand(args, bearerToken, 90000);
        let combinedErr = `${result.stderr || ''}\n${result.stdout || ''}`;

        // Fallback automatically to 'auto' if the specific model is unavailable on the user's Copilot plan
        if (
          result.code !== 0 &&
          model !== 'auto' &&
          /from --model flag is not available|model.*not available/i.test(combinedErr)
        ) {
          result = await runCopilotCommand(baseArgs, bearerToken, 90000);
          combinedErr = `${result.stderr || ''}\n${result.stdout || ''}`;
        }

        if (result.code !== 0) {
          if (/No authentication information found|authenticate|login/i.test(combinedErr)) {
            sendJson(res, 401, {
              error: {
                message:
                  "Copilot CLI is not authenticated. Run 'copilot login' in your terminal or provide a GitHub token in Settings.",
              },
            });
            return;
          }
          sendJson(res, 502, {
            error: {
              message: `Copilot CLI exited with code ${result.code}: ${combinedErr.slice(0, 400)}`,
            },
          });
          return;
        }

        const cleanedJson = extractJsonFromOutput(result.stdout);
        sendJson(res, 200, {
          id: `chatcmpl-copilot-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: cleanedJson,
              },
              finish_reason: 'stop',
            },
          ],
        });
      } catch (err) {
        sendJson(res, 500, {
          error: {
            message:
              err instanceof Error
                ? err.message
                : 'Internal error in Copilot CLI bridge',
          },
        });
      }
    });
    return;
  }

  sendJson(res, 404, { error: { message: `Not found: ${url.pathname}` } });
});

server.listen(PORT, HOST, () => {
  console.log(
    `[Visualise Page] Copilot CLI bridge listening on http://${HOST}:${PORT}/v1`
  );
});
