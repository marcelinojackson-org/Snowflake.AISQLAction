# Snowflake.AISQLAction

Run Snowflake Cortex AI SQL functions from a GitHub Action. Supported: `AI_COMPLETE`, `AI_EXTRACT`, `AI_SENTIMENT`.

## Common inputs (all functions)

| Input / Env | Required | Description |
|-------------|----------|-------------|
| `function` / `AI_FUNCTION` | No (defaults to `AI_COMPLETE`) | Cortex AI SQL function name. Supported: `AI_COMPLETE`, `AI_EXTRACT`, `AI_SENTIMENT` (or `SNOWFLAKE.CORTEX.COMPLETE` / `SNOWFLAKE.CORTEX.EXTRACT` / `SNOWFLAKE.CORTEX.SENTIMENT`). |
| `args` / `AI_ARGS` | Yes | JSON payload for the function. The schema depends on the function. |
| `SNOWFLAKE_*` env vars | Yes | Connection parameters for every call (`SNOWFLAKE_ACCOUNT` or `SNOWFLAKE_ACCOUNT_URL`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` or `SNOWFLAKE_PRIVATE_KEY_PATH`, `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`). |
| `SNOWFLAKE_LOG_LEVEL` | No | Set to `VERBOSE` to log the SQL and request JSON. |

## Function index

| Function | Required args | Optional args | Minimal args JSON |
|----------|--------------|--------------|------------------|
| [AI_COMPLETE](#ai_complete) | `model`, `prompt` | `model_parameters`, `response_format`, `show_details` | `{"model":"snowflake-arctic","prompt":"..."}` |
| [AI_EXTRACT](#ai_extract) | `response_format`, one of `text` or `file` | none | `{"text":"...","response_format":{"field":"question"}}` |
| [AI_SENTIMENT](#ai_sentiment) | `text` | `categories` | `{"text":"..."}` |

## AI_COMPLETE

Required args:
- `model` (string)
- `prompt` (string)

Optional args:
- `model_parameters` (object): `temperature`, `top_p`, `max_tokens`, `guardrails`.
- `response_format` (object): JSON schema for structured output.
- `show_details` (boolean): include response metadata.

Returns:
- String when `response_format` is omitted and `show_details` is false.
- Object when `response_format` is provided.
- When `show_details` is true, returns an object with `choices`, `created`, `model`, and `usage` (or `structured_output`, `created`, `model`, `usage` when `response_format` is provided).

### AI_COMPLETE examples

Simple:

```yaml
- name: AI_COMPLETE (simple)
  id: ai-complete-simple
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_COMPLETE
    args: >
      {
        "model": "snowflake-arctic",
        "prompt": "Write a short summary of the release notes."
      }
  env:
    SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
    SNOWFLAKE_ACCOUNT_URL: ${{ secrets.SNOWFLAKE_ACCOUNT_URL }}
    SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
    SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
    SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
    SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
    SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
    SNOWFLAKE_SCHEMA: ${{ secrets.SNOWFLAKE_SCHEMA }}
```

Advanced (all parameters):

```yaml
- name: AI_COMPLETE (advanced)
  id: ai-complete-advanced
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_COMPLETE
    args: >
      {
        "model": "snowflake-arctic",
        "prompt": "Write a short summary and a list of action items.",
        "model_parameters": {
          "temperature": 0.2,
          "top_p": 0.9,
          "max_tokens": 512,
          "guardrails": true
        },
        "response_format": {
          "type": "object",
          "properties": {
            "summary": { "type": "string" },
            "action_items": { "type": "array", "items": { "type": "string" } }
          },
          "required": ["summary", "action_items"]
        },
        "show_details": true
      }
  env:
    SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
    SNOWFLAKE_ACCOUNT_URL: ${{ secrets.SNOWFLAKE_ACCOUNT_URL }}
    SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
    SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
    SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
    SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
    SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
    SNOWFLAKE_SCHEMA: ${{ secrets.SNOWFLAKE_SCHEMA }}

- name: Inspect AI_COMPLETE output
  run: |
    echo '${{ steps.ai-complete-advanced.outputs.result-text }}'
    echo '${{ steps.ai-complete-advanced.outputs.result-json }}' | jq .
```

## AI_EXTRACT

Required args:
- `response_format` (object or array)
- One of `text` (string) or `file` (SQL FILE expression such as `@stage/path/file.pdf`).

Returns:
- JSON object with extracted information.

### AI_EXTRACT examples

Simple:

```yaml
- name: AI_EXTRACT (simple)
  id: ai-extract-simple
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_EXTRACT
    args: >
      {
        "text": "Order 18422 shipped to Denver on 2024-02-01 for $412.50.",
        "response_format": {
          "order_id": "What is the order id?",
          "city": "What is the destination city?",
          "date": "What is the ship date?",
          "amount": "What is the amount?"
        }
      }
  env:
    SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
    SNOWFLAKE_ACCOUNT_URL: ${{ secrets.SNOWFLAKE_ACCOUNT_URL }}
    SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
    SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
    SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
    SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
    SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
    SNOWFLAKE_SCHEMA: ${{ secrets.SNOWFLAKE_SCHEMA }}
```

Advanced (all parameters):

```yaml
- name: AI_EXTRACT (advanced)
  id: ai-extract-advanced
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_EXTRACT
    args: >
      {
        "file": "@reports_stage/financials/report-q2.pdf",
        "response_format": {
          "schema": {
            "type": "object",
            "properties": {
              "title": { "type": "string", "description": "Document title" },
              "employees": { "type": "array", "description": "Employee names" }
            }
          }
        }
      }
  env:
    SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
    SNOWFLAKE_ACCOUNT_URL: ${{ secrets.SNOWFLAKE_ACCOUNT_URL }}
    SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
    SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
    SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
    SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
    SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
    SNOWFLAKE_SCHEMA: ${{ secrets.SNOWFLAKE_SCHEMA }}

- name: Inspect AI_EXTRACT output
  run: |
    echo '${{ steps.ai-extract-advanced.outputs.result-text }}'
    echo '${{ steps.ai-extract-advanced.outputs.result-json }}' | jq .
```

## AI_SENTIMENT

Required args:
- `text` (string)

Optional args:
- `categories` (array of strings, up to 10 entries, each up to 30 characters)

Returns:
- Object with `categories` array.
- Each category includes `name` and `sentiment`.
- Sentiment values: `unknown`, `positive`, `negative`, `neutral`, `mixed`.
- `overall` category is always included.

### AI_SENTIMENT examples

Simple:

```yaml
- name: AI_SENTIMENT (simple)
  id: ai-sentiment-simple
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_SENTIMENT
    args: >
      {
        "text": "The service was fast but the food was average."
      }
  env:
    SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
    SNOWFLAKE_ACCOUNT_URL: ${{ secrets.SNOWFLAKE_ACCOUNT_URL }}
    SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
    SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
    SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
    SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
    SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
    SNOWFLAKE_SCHEMA: ${{ secrets.SNOWFLAKE_SCHEMA }}
```

Advanced (all parameters):

```yaml
- name: AI_SENTIMENT (advanced)
  id: ai-sentiment-advanced
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_SENTIMENT
    args: >
      {
        "text": "The service was fast but the food was average.",
        "categories": ["service", "food", "cost"]
      }
  env:
    SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
    SNOWFLAKE_ACCOUNT_URL: ${{ secrets.SNOWFLAKE_ACCOUNT_URL }}
    SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
    SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
    SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
    SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
    SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
    SNOWFLAKE_SCHEMA: ${{ secrets.SNOWFLAKE_SCHEMA }}

- name: Inspect AI_SENTIMENT output
  run: |
    echo '${{ steps.ai-sentiment-advanced.outputs.result-text }}'
    echo '${{ steps.ai-sentiment-advanced.outputs.result-json }}' | jq .
```

## Outputs

- `result-text`: first scalar value returned by the SQL call.
- `result-json`: JSON summary of the SQL call and response rows.
