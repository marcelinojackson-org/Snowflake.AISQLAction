import * as core from '@actions/core';
import { runSql, SnowflakeConnectionConfig } from '@marcelinojackson-org/snowflake-common';

type LogLevel = 'MINIMAL' | 'VERBOSE';

const SUPPORTED_FUNCTIONS = [
  'AI_COMPLETE',
  'SNOWFLAKE.CORTEX.COMPLETE',
  'AI_EXTRACT',
  'SNOWFLAKE.CORTEX.EXTRACT'
] as const;
const SUPPORTED_FUNCTION_SET = new Set<string>(SUPPORTED_FUNCTIONS);

interface AiCompletePayload {
  model: string;
  prompt: string;
  options?: Record<string, unknown>;
}

interface AiExtractPayload {
  model: string;
  text: string;
  schema: Record<string, unknown>;
  options?: Record<string, unknown>;
}

async function main(): Promise<void> {
  try {
    const functionRaw = core.getInput('function') || process.env.AI_FUNCTION || 'AI_COMPLETE';
    const functionName = normalizeFunctionName(functionRaw);
    assertSupportedFunction(functionName);

    const argsRaw = pickRequiredInput('args', 'AI_ARGS');

    const config = gatherConfig();
    const verbose = config.logLevel === 'VERBOSE';
    let sqlText = '';
    let request: Record<string, unknown> = {};
    let verboseArgs: unknown = {};
    const summaryLines: string[] = [`Function: ${functionName}`];

    switch (functionName) {
      case 'AI_COMPLETE':
      case 'SNOWFLAKE.CORTEX.COMPLETE': {
        const payload = parseAiCompleteArgs(argsRaw);
        sqlText = buildAiCompleteSql(functionName, payload);
        request = {
          model: payload.model,
          prompt: payload.prompt,
          ...(payload.options ? { options: payload.options } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`Model: ${payload.model}`);
        summaryLines.push(`Prompt length: ${payload.prompt.length} chars`);
        if (payload.options) {
          summaryLines.push(`Options keys: ${Object.keys(payload.options).join(', ')}`);
        }
        break;
      }
      case 'AI_EXTRACT':
      case 'SNOWFLAKE.CORTEX.EXTRACT': {
        const payload = parseAiExtractArgs(argsRaw);
        sqlText = buildAiExtractSql(functionName, payload);
        request = {
          model: payload.model,
          text: payload.text,
          schema: payload.schema,
          ...(payload.options ? { options: payload.options } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`Model: ${payload.model}`);
        summaryLines.push(`Text length: ${payload.text.length} chars`);
        summaryLines.push(`Schema keys: ${Object.keys(payload.schema).join(', ')}`);
        if (payload.options) {
          summaryLines.push(`Options keys: ${Object.keys(payload.options).join(', ')}`);
        }
        break;
      }
      default:
        throw new Error(`Unsupported function '${functionName}'.`);
    }

    if (verbose) {
      console.log(`[VERBOSE] SQL: ${sqlText}`);
      console.log(`[VERBOSE] Args: ${JSON.stringify(verboseArgs)}`);
    } else {
      summaryLines.forEach((line) => console.log(line));
    }

    const result = await runSql(sqlText, config);
    const value = extractFirstValue(result.rows);

    const output = {
      function: functionName,
      request,
      result: {
        queryId: result.queryId,
        rowCount: result.rowCount,
        rows: result.rows,
        value
      }
    };

    console.log('Cortex AI SQL call succeeded.');
    console.log('Response JSON:', JSON.stringify(output, null, 2));

    core.setOutput('result-json', JSON.stringify(output));
    if (value !== undefined) {
      if (typeof value === 'string') {
        core.setOutput('result-text', value);
      } else {
        core.setOutput('result-text', JSON.stringify(value));
      }
    } else {
      core.setOutput('result-text', '');
    }
  } catch (error) {
    console.error('Cortex AI SQL call failed:');
    if (error instanceof Error) {
      console.error(error.stack ?? error.message);
      core.setFailed(error.message);
    } else {
      console.error(error);
      core.setFailed('Unknown error when running AI SQL');
    }
  }
}

void main();

function gatherConfig(): SnowflakeConnectionConfig {
  const logLevel = normalizeLogLevel(process.env.SNOWFLAKE_LOG_LEVEL);
  return {
    account: process.env.SNOWFLAKE_ACCOUNT || process.env.SNOWFLAKE_ACCOUNT_URL,
    username: process.env.SNOWFLAKE_USER,
    password: process.env.SNOWFLAKE_PASSWORD,
    privateKeyPath: process.env.SNOWFLAKE_PRIVATE_KEY_PATH,
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    logLevel
  };
}

function normalizeLogLevel(value?: string): LogLevel {
  const upper = (value ?? 'MINIMAL').toUpperCase();
  return upper === 'VERBOSE' ? 'VERBOSE' : 'MINIMAL';
}

function normalizeFunctionName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Missing function name - provide `function` input or set AI_FUNCTION.');
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'AI_COMPLETE') {
    return 'AI_COMPLETE';
  }
  if (upper === 'SNOWFLAKE.CORTEX.COMPLETE') {
    return 'SNOWFLAKE.CORTEX.COMPLETE';
  }
  if (upper === 'AI_EXTRACT') {
    return 'AI_EXTRACT';
  }
  if (upper === 'SNOWFLAKE.CORTEX.EXTRACT') {
    return 'SNOWFLAKE.CORTEX.EXTRACT';
  }
  return upper;
}

function assertSupportedFunction(functionName: string): void {
  if (!SUPPORTED_FUNCTION_SET.has(functionName)) {
    throw new Error(`Unsupported function '${functionName}'. Supported: ${SUPPORTED_FUNCTIONS.join(', ')}.`);
  }
}

function pickRequiredInput(inputName: string, envName: string): string {
  const value = core.getInput(inputName) || process.env[envName];
  if (!value || !value.trim()) {
    throw new Error(`Missing ${inputName} input - provide '${inputName}' or set ${envName}.`);
  }
  return value;
}

function parseAiCompleteArgs(raw: string): AiCompletePayload {
  const parsed = parseJsonObject(raw, 'args');

  const { model, prompt, options, ...rest } = parsed;
  const resolvedModel = requireTrimmedString(model, 'model');
  const resolvedPrompt = requireNonEmptyString(prompt, 'prompt');
  let resolvedOptions: Record<string, unknown> | undefined;

  if (options !== undefined) {
    if (!isPlainObject(options)) {
      throw new Error('AI_COMPLETE options must be a JSON object.');
    }
    resolvedOptions = { ...(options as Record<string, unknown>) };
  }

  if (Object.keys(rest).length > 0) {
    if (resolvedOptions) {
      resolvedOptions = { ...resolvedOptions, ...rest };
    } else {
      resolvedOptions = rest;
    }
  }

  if (resolvedOptions && Object.keys(resolvedOptions).length === 0) {
    resolvedOptions = undefined;
  }

  return { model: resolvedModel, prompt: resolvedPrompt, options: resolvedOptions };
}

function parseAiExtractArgs(raw: string): AiExtractPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { model, text, prompt, input, schema, options, ...rest } = parsed;
  const resolvedModel = requireTrimmedString(model, 'model');
  const resolvedText = requireTextInput(text, prompt, input);
  const resolvedSchema = requireSchema(schema);
  let resolvedOptions: Record<string, unknown> | undefined;

  if (options !== undefined) {
    if (!isPlainObject(options)) {
      throw new Error('AI_EXTRACT options must be a JSON object.');
    }
    resolvedOptions = { ...(options as Record<string, unknown>) };
  }

  if (Object.keys(rest).length > 0) {
    if (resolvedOptions) {
      resolvedOptions = { ...resolvedOptions, ...rest };
    } else {
      resolvedOptions = rest;
    }
  }

  if (resolvedOptions && Object.keys(resolvedOptions).length === 0) {
    resolvedOptions = undefined;
  }

  return {
    model: resolvedModel,
    text: resolvedText,
    schema: resolvedSchema,
    options: resolvedOptions
  };
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${label} cannot be empty.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Invalid ${label} JSON: ${(err as Error).message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireTrimmedString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Missing ${field} - expected a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing ${field} - cannot be blank.`);
  }
  return trimmed;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Missing ${field} - expected a string.`);
  }
  if (!value.trim()) {
    throw new Error(`Missing ${field} - cannot be blank.`);
  }
  return value;
}

function requireTextInput(text?: unknown, prompt?: unknown, input?: unknown): string {
  const candidates: Array<{ label: string; value: unknown }> = [
    { label: 'text', value: text },
    { label: 'prompt', value: prompt },
    { label: 'input', value: input }
  ];

  for (const candidate of candidates) {
    if (candidate.value === undefined || candidate.value === null) {
      continue;
    }
    if (typeof candidate.value !== 'string') {
      throw new Error(`Expected ${candidate.label} to be a string.`);
    }
    if (!candidate.value.trim()) {
      throw new Error(`Missing ${candidate.label} - cannot be blank.`);
    }
    return candidate.value;
  }

  throw new Error('Missing text - provide `text`, `prompt`, or `input`.');
}

function requireSchema(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    throw new Error('Missing schema - expected a JSON object or JSON string.');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Missing schema - cannot be blank.');
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!isPlainObject(parsed)) {
        throw new Error('schema must be a JSON object.');
      }
      return parsed;
    } catch (err) {
      throw new Error(`Invalid schema JSON: ${(err as Error).message}`);
    }
  }

  if (isPlainObject(value)) {
    return value;
  }

  throw new Error('schema must be a JSON object or JSON string.');
}

function buildAiCompleteSql(functionName: string, payload: AiCompletePayload): string {
  const modelLiteral = toSqlString(payload.model);
  const promptLiteral = toSqlString(payload.prompt);

  if (payload.options && Object.keys(payload.options).length > 0) {
    const optionsJson = JSON.stringify(payload.options);
    const optionsLiteral = toSqlString(optionsJson);
    return `select ${functionName}(${modelLiteral}, ${promptLiteral}, PARSE_JSON(${optionsLiteral})) as response`;
  }

  return `select ${functionName}(${modelLiteral}, ${promptLiteral}) as response`;
}

function buildAiExtractSql(functionName: string, payload: AiExtractPayload): string {
  const modelLiteral = toSqlString(payload.model);
  const textLiteral = toSqlString(payload.text);
  const schemaJson = JSON.stringify(payload.schema);
  const schemaLiteral = toSqlString(schemaJson);

  if (payload.options && Object.keys(payload.options).length > 0) {
    const optionsJson = JSON.stringify(payload.options);
    const optionsLiteral = toSqlString(optionsJson);
    return `select ${functionName}(${modelLiteral}, ${textLiteral}, PARSE_JSON(${schemaLiteral}), PARSE_JSON(${optionsLiteral})) as response`;
  }

  return `select ${functionName}(${modelLiteral}, ${textLiteral}, PARSE_JSON(${schemaLiteral})) as response`;
}

function toSqlString(value: string): string {
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

function extractFirstValue(rows: Array<Record<string, unknown>>): unknown {
  if (!rows.length) {
    return undefined;
  }
  const row = rows[0];
  const keys = Object.keys(row);
  if (!keys.length) {
    return undefined;
  }
  return row[keys[0]];
}
