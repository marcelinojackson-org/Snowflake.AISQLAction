import * as core from '@actions/core';
import { runSql, SnowflakeConnectionConfig } from '@marcelinojackson-org/snowflake-common';

type LogLevel = 'MINIMAL' | 'VERBOSE';

const SUPPORTED_FUNCTIONS = [
  'AI_COMPLETE',
  'SNOWFLAKE.CORTEX.COMPLETE',
  'AI_EXTRACT',
  'SNOWFLAKE.CORTEX.EXTRACT',
  'AI_SENTIMENT',
  'SNOWFLAKE.CORTEX.SENTIMENT',
  'AI_CLASSIFY',
  'SNOWFLAKE.CORTEX.CLASSIFY',
  'AI_COUNT_TOKENS',
  'SNOWFLAKE.CORTEX.COUNT_TOKENS',
  'AI_EMBED',
  'SNOWFLAKE.CORTEX.EMBED',
  'AI_SIMILARITY',
  'SNOWFLAKE.CORTEX.SIMILARITY',
  'AI_PARSE_DOCUMENT',
  'SNOWFLAKE.CORTEX.PARSE_DOCUMENT'
] as const;
const SUPPORTED_FUNCTION_SET = new Set<string>(SUPPORTED_FUNCTIONS);

interface AiCompletePayload {
  model: string;
  prompt: string;
  modelParameters?: Record<string, unknown>;
  responseFormat?: Record<string, unknown>;
  showDetails?: boolean;
}

interface AiExtractPayload {
  text?: string;
  file?: string;
  responseFormat: Record<string, unknown> | unknown[];
}

interface AiSentimentPayload {
  text: string;
  categories?: string[];
}

interface AiClassifyPayload {
  input: string | Record<string, unknown>;
  categories: Array<string | { label: string; description?: string }>;
  config?: Record<string, unknown>;
}

interface AiCountTokensPayload {
  functionName: string;
  inputText: string;
  modelName?: string;
  categories?: unknown[];
}

interface AiEmbedPayload {
  model: string;
  input: string;
  inputFile?: string;
}

interface AiSimilarityPayload {
  input1: string;
  input2: string;
  input1File?: string;
  input2File?: string;
  config?: Record<string, unknown>;
}

interface AiParseDocumentPayload {
  file: string;
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
          ...(payload.modelParameters ? { model_parameters: payload.modelParameters } : {}),
          ...(payload.responseFormat ? { response_format: payload.responseFormat } : {}),
          ...(payload.showDetails !== undefined ? { show_details: payload.showDetails } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`Model: ${payload.model}`);
        summaryLines.push(`Prompt length: ${payload.prompt.length} chars`);
        if (payload.modelParameters) {
          summaryLines.push(`Model parameters: ${Object.keys(payload.modelParameters).join(', ')}`);
        }
        if (payload.responseFormat) {
          summaryLines.push('Response format: provided');
        }
        if (payload.showDetails !== undefined) {
          summaryLines.push(`Show details: ${payload.showDetails}`);
        }
        break;
      }
      case 'AI_EXTRACT':
      case 'SNOWFLAKE.CORTEX.EXTRACT': {
        const payload = parseAiExtractArgs(argsRaw);
        sqlText = buildAiExtractSql(functionName, payload);
        request = {
          ...(payload.text ? { text: payload.text } : {}),
          ...(payload.file ? { file: payload.file } : {}),
          response_format: payload.responseFormat
        };
        verboseArgs = payload;
        if (payload.text) {
          summaryLines.push(`Text length: ${payload.text.length} chars`);
        }
        if (payload.file) {
          summaryLines.push(`File: ${payload.file}`);
        }
        summaryLines.push(
          `Response format: ${Array.isArray(payload.responseFormat) ? 'array' : 'object'}`
        );
        break;
      }
      case 'AI_SENTIMENT':
      case 'SNOWFLAKE.CORTEX.SENTIMENT': {
        const payload = parseAiSentimentArgs(argsRaw);
        sqlText = buildAiSentimentSql(functionName, payload);
        request = {
          text: payload.text,
          ...(payload.categories ? { categories: payload.categories } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`Text length: ${payload.text.length} chars`);
        if (payload.categories) {
          summaryLines.push(`Categories: ${payload.categories.length}`);
        }
        break;
      }
      case 'AI_CLASSIFY':
      case 'SNOWFLAKE.CORTEX.CLASSIFY': {
        const payload = parseAiClassifyArgs(argsRaw);
        sqlText = buildAiClassifySql(functionName, payload);
        request = {
          input: payload.input,
          categories: payload.categories,
          ...(payload.config ? { config_object: payload.config } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`Categories: ${payload.categories.length}`);
        if (payload.config) {
          summaryLines.push(`Config keys: ${Object.keys(payload.config).join(', ')}`);
        }
        break;
      }
      case 'AI_COUNT_TOKENS':
      case 'SNOWFLAKE.CORTEX.COUNT_TOKENS': {
        const payload = parseAiCountTokensArgs(argsRaw);
        sqlText = buildAiCountTokensSql(functionName, payload);
        request = {
          function_name: payload.functionName,
          input_text: payload.inputText,
          ...(payload.modelName ? { model_name: payload.modelName } : {}),
          ...(payload.categories ? { categories: payload.categories } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`Function name: ${payload.functionName}`);
        if (payload.modelName) {
          summaryLines.push(`Model: ${payload.modelName}`);
        }
        if (payload.categories) {
          summaryLines.push(`Categories: ${payload.categories.length}`);
        }
        break;
      }
      case 'AI_EMBED':
      case 'SNOWFLAKE.CORTEX.EMBED': {
        const payload = parseAiEmbedArgs(argsRaw);
        sqlText = buildAiEmbedSql(functionName, payload);
        request = {
          model: payload.model,
          ...(payload.inputFile ? { input_file: payload.inputFile } : { input: payload.input })
        };
        verboseArgs = payload;
        summaryLines.push(`Model: ${payload.model}`);
        if (payload.inputFile) {
          summaryLines.push(`Input file: ${payload.inputFile}`);
        } else {
          summaryLines.push(`Input length: ${payload.input.length} chars`);
        }
        break;
      }
      case 'AI_SIMILARITY':
      case 'SNOWFLAKE.CORTEX.SIMILARITY': {
        const payload = parseAiSimilarityArgs(argsRaw);
        sqlText = buildAiSimilaritySql(functionName, payload);
        request = {
          ...(payload.input1File
            ? { input1_file: payload.input1File, input2_file: payload.input2File }
            : { input1: payload.input1, input2: payload.input2 }),
          ...(payload.config ? { config_object: payload.config } : {})
        };
        verboseArgs = payload;
        if (payload.input1File && payload.input2File) {
          summaryLines.push(`Input 1 file: ${payload.input1File}`);
          summaryLines.push(`Input 2 file: ${payload.input2File}`);
        } else {
          summaryLines.push(`Input 1 length: ${payload.input1.length} chars`);
          summaryLines.push(`Input 2 length: ${payload.input2.length} chars`);
        }
        if (payload.config) {
          summaryLines.push(`Config keys: ${Object.keys(payload.config).join(', ')}`);
        }
        break;
      }
      case 'AI_PARSE_DOCUMENT':
      case 'SNOWFLAKE.CORTEX.PARSE_DOCUMENT': {
        const payload = parseAiParseDocumentArgs(argsRaw);
        sqlText = buildAiParseDocumentSql(functionName, payload);
        request = {
          file: payload.file,
          ...(payload.options ? { options: payload.options } : {})
        };
        verboseArgs = payload;
        summaryLines.push(`File: ${payload.file}`);
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
  if (upper === 'AI_SENTIMENT') {
    return 'AI_SENTIMENT';
  }
  if (upper === 'SNOWFLAKE.CORTEX.SENTIMENT') {
    return 'SNOWFLAKE.CORTEX.SENTIMENT';
  }
  if (upper === 'AI_CLASSIFY') {
    return 'AI_CLASSIFY';
  }
  if (upper === 'SNOWFLAKE.CORTEX.CLASSIFY') {
    return 'SNOWFLAKE.CORTEX.CLASSIFY';
  }
  if (upper === 'AI_COUNT_TOKENS') {
    return 'AI_COUNT_TOKENS';
  }
  if (upper === 'SNOWFLAKE.CORTEX.COUNT_TOKENS') {
    return 'SNOWFLAKE.CORTEX.COUNT_TOKENS';
  }
  if (upper === 'AI_EMBED') {
    return 'AI_EMBED';
  }
  if (upper === 'SNOWFLAKE.CORTEX.EMBED') {
    return 'SNOWFLAKE.CORTEX.EMBED';
  }
  if (upper === 'AI_SIMILARITY') {
    return 'AI_SIMILARITY';
  }
  if (upper === 'SNOWFLAKE.CORTEX.SIMILARITY') {
    return 'SNOWFLAKE.CORTEX.SIMILARITY';
  }
  if (upper === 'AI_PARSE_DOCUMENT') {
    return 'AI_PARSE_DOCUMENT';
  }
  if (upper === 'SNOWFLAKE.CORTEX.PARSE_DOCUMENT') {
    return 'SNOWFLAKE.CORTEX.PARSE_DOCUMENT';
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

  const {
    model,
    prompt,
    model_parameters,
    modelParameters,
    response_format,
    responseFormat,
    show_details,
    showDetails,
    options,
    ...rest
  } = parsed;
  const resolvedModel = requireTrimmedString(model, 'model');
  const resolvedPrompt = requireNonEmptyString(prompt, 'prompt');

  const resolvedModelParameters = mergeModelParameters(model_parameters, modelParameters, options, rest);
  const resolvedResponseFormat = resolveResponseFormat(response_format, responseFormat);
  const resolvedShowDetails = resolveShowDetails(show_details, showDetails);

  return {
    model: resolvedModel,
    prompt: resolvedPrompt,
    modelParameters: resolvedModelParameters,
    responseFormat: resolvedResponseFormat,
    showDetails: resolvedShowDetails
  };
}

function mergeModelParameters(
  modelParameters?: unknown,
  modelParametersAlt?: unknown,
  options?: unknown,
  rest?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const sources: Record<string, unknown>[] = [];

  if (modelParameters !== undefined) {
    if (!isPlainObject(modelParameters)) {
      throw new Error('AI_COMPLETE model_parameters must be a JSON object.');
    }
    sources.push(modelParameters);
  }

  if (modelParametersAlt !== undefined) {
    if (!isPlainObject(modelParametersAlt)) {
      throw new Error('AI_COMPLETE modelParameters must be a JSON object.');
    }
    sources.push(modelParametersAlt);
  }

  if (options !== undefined) {
    if (!isPlainObject(options)) {
      throw new Error('AI_COMPLETE options must be a JSON object.');
    }
    sources.push(options);
  }

  if (rest && Object.keys(rest).length > 0) {
    sources.push(rest);
  }

  if (sources.length === 0) {
    return undefined;
  }

  const merged = Object.assign({}, ...sources);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function resolveResponseFormat(responseFormat?: unknown, responseFormatAlt?: unknown): Record<string, unknown> | undefined {
  const primary = responseFormat !== undefined ? responseFormat : responseFormatAlt;
  const secondary = responseFormat !== undefined && responseFormatAlt !== undefined;

  if (secondary) {
    throw new Error('Provide only one of response_format or responseFormat.');
  }

  if (primary === undefined) {
    return undefined;
  }

  if (!isPlainObject(primary)) {
    throw new Error('AI_COMPLETE response_format must be a JSON object.');
  }

  return primary;
}

function resolveShowDetails(showDetails?: unknown, showDetailsAlt?: unknown): boolean | undefined {
  const primary = showDetails !== undefined ? showDetails : showDetailsAlt;
  const secondary = showDetails !== undefined && showDetailsAlt !== undefined;

  if (secondary) {
    throw new Error('Provide only one of show_details or showDetails.');
  }

  if (primary === undefined) {
    return undefined;
  }

  if (typeof primary !== 'boolean') {
    throw new Error('AI_COMPLETE show_details must be a boolean.');
  }

  return primary;
}

function parseAiExtractArgs(raw: string): AiExtractPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { text, file, response_format, responseFormat, ...rest } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_EXTRACT does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  const hasText = text !== undefined && text !== null;
  const hasFile = file !== undefined && file !== null;
  if (hasText === hasFile) {
    throw new Error('AI_EXTRACT requires either `text` or `file` (but not both).');
  }

  let resolvedText: string | undefined;
  let resolvedFile: string | undefined;

  if (hasText) {
    resolvedText = requireNonEmptyString(text, 'text');
  } else if (hasFile) {
    resolvedFile = requireNonEmptyString(file, 'file');
  }

  const resolvedResponseFormat = resolveExtractResponseFormat(response_format, responseFormat);

  return {
    text: resolvedText,
    file: resolvedFile,
    responseFormat: resolvedResponseFormat
  };
}

function resolveExtractResponseFormat(
  responseFormat?: unknown,
  responseFormatAlt?: unknown
): Record<string, unknown> | unknown[] {
  const primary = responseFormat !== undefined ? responseFormat : responseFormatAlt;
  const secondary = responseFormat !== undefined && responseFormatAlt !== undefined;

  if (secondary) {
    throw new Error('Provide only one of response_format or responseFormat.');
  }

  if (primary === undefined) {
    throw new Error('Missing response_format - expected an object or array.');
  }

  if (!isPlainObject(primary) && !Array.isArray(primary)) {
    throw new Error('AI_EXTRACT response_format must be a JSON object or array.');
  }

  return primary;
}

function resolveClassifyInput(value: unknown): string | Record<string, unknown> {
  if (value === undefined || value === null) {
    throw new Error('Missing input - expected a string or JSON object.');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('Missing input - cannot be blank.');
    }
    return value;
  }
  if (isPlainObject(value)) {
    return value;
  }
  throw new Error('AI_CLASSIFY input must be a string or JSON object.');
}

function normalizeClassifyCategories(
  value: unknown,
  label: string
): Array<string | { label: string; description?: string }> {
  if (!Array.isArray(value)) {
    throw new Error(`AI_CLASSIFY ${label} must be a JSON array.`);
  }
  if (value.length === 0) {
    throw new Error(`AI_CLASSIFY ${label} cannot be empty.`);
  }

  const normalized: Array<string | { label: string; description?: string }> = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) {
        throw new Error(`AI_CLASSIFY ${label}[${index}] cannot be blank.`);
      }
      if (seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      normalized.push(trimmed);
      return;
    }

    if (isPlainObject(entry)) {
      const rawLabel = entry.label;
      if (typeof rawLabel !== 'string' || !rawLabel.trim()) {
        throw new Error(`AI_CLASSIFY ${label}[${index}].label must be a non-empty string.`);
      }
      const trimmedLabel = rawLabel.trim();
      if (seen.has(trimmedLabel)) {
        return;
      }
      const description = entry.description;
      if (description !== undefined && typeof description !== 'string') {
        throw new Error(`AI_CLASSIFY ${label}[${index}].description must be a string.`);
      }
      seen.add(trimmedLabel);
      normalized.push({
        label: trimmedLabel,
        ...(description && description.trim() ? { description: description.trim() } : {})
      });
      return;
    }

    throw new Error(`AI_CLASSIFY ${label}[${index}] must be a string or object.`);
  });

  return normalized;
}

function parseAiSentimentArgs(raw: string): AiSentimentPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { text, categories, ...rest } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_SENTIMENT does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  const resolvedText = requireNonEmptyString(text, 'text');
  let resolvedCategories: string[] | undefined;

  if (categories !== undefined) {
    if (!Array.isArray(categories)) {
      throw new Error('AI_SENTIMENT categories must be a JSON array of strings.');
    }
    if (categories.length === 0) {
      throw new Error('AI_SENTIMENT categories cannot be empty.');
    }
    if (categories.length > 10) {
      throw new Error('AI_SENTIMENT categories supports up to 10 items.');
    }
    resolvedCategories = categories.map((entry, index) => {
      if (typeof entry !== 'string') {
        throw new Error(`AI_SENTIMENT categories[${index}] must be a string.`);
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        throw new Error(`AI_SENTIMENT categories[${index}] cannot be blank.`);
      }
      if (trimmed.length > 30) {
        throw new Error(`AI_SENTIMENT categories[${index}] exceeds 30 characters.`);
      }
      return trimmed;
    });
  }

  return { text: resolvedText, categories: resolvedCategories };
}

function parseAiClassifyArgs(raw: string): AiClassifyPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { input, list_of_categories, categories, config_object, config, ...rest } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_CLASSIFY does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  if (list_of_categories !== undefined && categories !== undefined) {
    throw new Error('Provide only one of list_of_categories or categories.');
  }

  const resolvedCategories = normalizeClassifyCategories(
    (categories ?? list_of_categories) as unknown,
    'categories'
  );

  if (resolvedCategories.length < 2) {
    throw new Error('AI_CLASSIFY requires at least two unique categories.');
  }

  const resolvedInput = resolveClassifyInput(input);

  if (config_object !== undefined && config !== undefined) {
    throw new Error('Provide only one of config_object or config.');
  }

  let resolvedConfig: Record<string, unknown> | undefined;
  const configValue = config_object ?? config;
  if (configValue !== undefined) {
    if (!isPlainObject(configValue)) {
      throw new Error('AI_CLASSIFY config_object must be a JSON object.');
    }
    resolvedConfig = configValue;
  }

  return {
    input: resolvedInput,
    categories: resolvedCategories,
    ...(resolvedConfig ? { config: resolvedConfig } : {})
  };
}

function parseAiCountTokensArgs(raw: string): AiCountTokensPayload {
  const parsed = parseJsonObject(raw, 'args');

  const {
    function_name,
    function: functionAlt,
    input_text,
    text,
    model_name,
    modelName,
    categories,
    ...rest
  } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_COUNT_TOKENS does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  const rawFunctionName = requireTrimmedString(function_name ?? functionAlt, 'function_name').toLowerCase();
  if (!rawFunctionName.startsWith('ai_')) {
    throw new Error('AI_COUNT_TOKENS function_name must start with ai_.');
  }

  const inputText = requireNonEmptyString(input_text ?? text, 'input_text');

  let resolvedModelName: string | undefined;
  if (model_name !== undefined && modelName !== undefined) {
    throw new Error('Provide only one of model_name or modelName.');
  }
  if (model_name !== undefined || modelName !== undefined) {
    resolvedModelName = requireTrimmedString(model_name ?? modelName, 'model_name');
  }

  let resolvedCategories: unknown[] | undefined;
  if (categories !== undefined) {
    if (!Array.isArray(categories)) {
      throw new Error('AI_COUNT_TOKENS categories must be a JSON array.');
    }
    resolvedCategories = categories;
  }

  if (resolvedModelName && resolvedCategories) {
    throw new Error('AI_COUNT_TOKENS accepts either model_name or categories, not both.');
  }

  return {
    functionName: rawFunctionName,
    inputText,
    ...(resolvedModelName ? { modelName: resolvedModelName } : {}),
    ...(resolvedCategories ? { categories: resolvedCategories } : {})
  };
}

function parseAiEmbedArgs(raw: string): AiEmbedPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { model, input, input_file, ...rest } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_EMBED does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  if (input !== undefined && input_file !== undefined) {
    throw new Error('AI_EMBED requires either input or input_file, not both.');
  }

  const resolvedModel = requireTrimmedString(model, 'model');

  let resolvedInput = '';
  let resolvedInputFile: string | undefined;

  if (input_file !== undefined) {
    resolvedInputFile = requireNonEmptyString(input_file, 'input_file');
  } else {
    resolvedInput = requireNonEmptyString(input, 'input');
  }

  return {
    model: resolvedModel,
    input: resolvedInput,
    ...(resolvedInputFile ? { inputFile: resolvedInputFile } : {})
  };
}

function parseAiSimilarityArgs(raw: string): AiSimilarityPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { input1, input2, input1_file, input2_file, config_object, config, ...rest } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_SIMILARITY does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  const hasText = input1 !== undefined || input2 !== undefined;
  const hasFile = input1_file !== undefined || input2_file !== undefined;

  if (hasText && hasFile) {
    throw new Error('AI_SIMILARITY requires either input1/input2 or input1_file/input2_file, not both.');
  }

  let resolvedInput1 = '';
  let resolvedInput2 = '';
  let resolvedInput1File: string | undefined;
  let resolvedInput2File: string | undefined;

  if (hasFile) {
    resolvedInput1File = requireNonEmptyString(input1_file, 'input1_file');
    resolvedInput2File = requireNonEmptyString(input2_file, 'input2_file');
  } else {
    resolvedInput1 = requireNonEmptyString(input1, 'input1');
    resolvedInput2 = requireNonEmptyString(input2, 'input2');
  }

  if (config_object !== undefined && config !== undefined) {
    throw new Error('Provide only one of config_object or config.');
  }

  let resolvedConfig: Record<string, unknown> | undefined;
  const configValue = config_object ?? config;
  if (configValue !== undefined) {
    if (!isPlainObject(configValue)) {
      throw new Error('AI_SIMILARITY config_object must be a JSON object.');
    }
    resolvedConfig = configValue;
  }

  return {
    input1: resolvedInput1,
    input2: resolvedInput2,
    ...(resolvedInput1File ? { input1File: resolvedInput1File } : {}),
    ...(resolvedInput2File ? { input2File: resolvedInput2File } : {}),
    ...(resolvedConfig ? { config: resolvedConfig } : {})
  };
}

function parseAiParseDocumentArgs(raw: string): AiParseDocumentPayload {
  const parsed = parseJsonObject(raw, 'args');

  const { file, file_object, options, ...rest } = parsed;
  if (Object.keys(rest).length > 0) {
    throw new Error(`AI_PARSE_DOCUMENT does not accept additional arguments: ${Object.keys(rest).join(', ')}`);
  }

  if (file !== undefined && file_object !== undefined) {
    throw new Error('Provide only one of file or file_object.');
  }

  const resolvedFile = requireNonEmptyString(file ?? file_object, 'file');

  let resolvedOptions: Record<string, unknown> | undefined;
  if (options !== undefined) {
    if (!isPlainObject(options)) {
      throw new Error('AI_PARSE_DOCUMENT options must be a JSON object.');
    }
    resolvedOptions = options;
  }

  return {
    file: resolvedFile,
    ...(resolvedOptions ? { options: resolvedOptions } : {})
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

function buildAiCompleteSql(functionName: string, payload: AiCompletePayload): string {
  const args: string[] = [];
  args.push(`model => ${toSqlString(payload.model)}`);
  args.push(`prompt => ${toSqlString(payload.prompt)}`);

  if (payload.modelParameters && Object.keys(payload.modelParameters).length > 0) {
    const paramsJson = JSON.stringify(payload.modelParameters);
    args.push(`model_parameters => PARSE_JSON(${toSqlString(paramsJson)})`);
  }

  if (payload.responseFormat) {
    const formatJson = JSON.stringify(payload.responseFormat);
    args.push(`response_format => PARSE_JSON(${toSqlString(formatJson)})`);
  }

  if (payload.showDetails !== undefined) {
    args.push(`show_details => ${payload.showDetails ? 'TRUE' : 'FALSE'}`);
  }

  return `select ${functionName}(${args.join(', ')}) as response`;
}

function buildAiExtractSql(functionName: string, payload: AiExtractPayload): string {
  const responseJson = JSON.stringify(payload.responseFormat);
  const responseLiteral = toSqlString(responseJson);
  const args: string[] = [];

  if (payload.text) {
    args.push(`text => ${toSqlString(payload.text)}`);
  }
  if (payload.file) {
    args.push(`file => ${payload.file}`);
  }

  args.push(`responseFormat => PARSE_JSON(${responseLiteral})`);

  return `select ${functionName}(${args.join(', ')}) as response`;
}

function buildAiClassifySql(functionName: string, payload: AiClassifyPayload): string {
  const args: string[] = [];
  if (typeof payload.input === 'string') {
    args.push(`input => ${toSqlString(payload.input)}`);
  } else {
    const inputJson = JSON.stringify(payload.input);
    args.push(`input => PARSE_JSON(${toSqlString(inputJson)})`);
  }

  const categoriesJson = JSON.stringify(payload.categories);
  args.push(`list_of_categories => PARSE_JSON(${toSqlString(categoriesJson)})`);

  if (payload.config) {
    const configJson = JSON.stringify(payload.config);
    args.push(`config_object => PARSE_JSON(${toSqlString(configJson)})`);
  }

  return `select ${functionName}(${args.join(', ')}) as response`;
}

function buildAiCountTokensSql(functionName: string, payload: AiCountTokensPayload): string {
  const functionLiteral = toSqlString(payload.functionName);
  const textLiteral = toSqlString(payload.inputText);

  if (payload.modelName) {
    const modelLiteral = toSqlString(payload.modelName);
    return `select ${functionName}(${functionLiteral}, ${modelLiteral}, ${textLiteral}) as response`;
  }

  if (payload.categories) {
    const categoriesJson = JSON.stringify(payload.categories);
    const categoriesLiteral = toSqlString(categoriesJson);
    return `select ${functionName}(${functionLiteral}, ${textLiteral}, PARSE_JSON(${categoriesLiteral})) as response`;
  }

  return `select ${functionName}(${functionLiteral}, ${textLiteral}) as response`;
}

function buildAiEmbedSql(functionName: string, payload: AiEmbedPayload): string {
  const modelLiteral = toSqlString(payload.model);
  const inputLiteral = payload.inputFile ? payload.inputFile : toSqlString(payload.input);
  return `select ${functionName}(${modelLiteral}, ${inputLiteral}) as response`;
}

function buildAiSimilaritySql(functionName: string, payload: AiSimilarityPayload): string {
  const input1Expr = payload.input1File ? payload.input1File : toSqlString(payload.input1);
  const input2Expr = payload.input2File ? payload.input2File : toSqlString(payload.input2);
  const args: string[] = [input1Expr, input2Expr];

  if (payload.config) {
    const configJson = JSON.stringify(payload.config);
    args.push(`PARSE_JSON(${toSqlString(configJson)})`);
  }

  return `select ${functionName}(${args.join(', ')}) as response`;
}

function buildAiParseDocumentSql(functionName: string, payload: AiParseDocumentPayload): string {
  const args: string[] = [];
  args.push(`file => ${payload.file}`);

  if (payload.options) {
    const optionsJson = JSON.stringify(payload.options);
    args.push(`options => PARSE_JSON(${toSqlString(optionsJson)})`);
  }

  return `select ${functionName}(${args.join(', ')}) as response`;
}

function buildAiSentimentSql(functionName: string, payload: AiSentimentPayload): string {
  const textLiteral = toSqlString(payload.text);

  if (payload.categories && payload.categories.length > 0) {
    const categoriesJson = JSON.stringify(payload.categories);
    const categoriesLiteral = toSqlString(categoriesJson);
    return `select ${functionName}(${textLiteral}, PARSE_JSON(${categoriesLiteral})) as response`;
  }

  return `select ${functionName}(${textLiteral}) as response`;
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
