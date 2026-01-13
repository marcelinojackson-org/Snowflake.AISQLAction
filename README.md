# Snowflake.AISQLAction

Run Snowflake Cortex AI SQL functions from a GitHub Action. This version supports `AI_COMPLETE` and `AI_EXTRACT`.

## Common inputs (all functions)

| Input / Env | Required | Description |
|-------------|----------|-------------|
| `function` / `AI_FUNCTION` | No (defaults to `AI_COMPLETE`) | Cortex AI SQL function name. Supported: `AI_COMPLETE`, `AI_EXTRACT` (or `SNOWFLAKE.CORTEX.COMPLETE` / `SNOWFLAKE.CORTEX.EXTRACT`). |
| `args` / `AI_ARGS` | Yes | JSON payload for the function. The schema depends on the function. |
| `SNOWFLAKE_*` env vars | Yes | Connection parameters for every call (`SNOWFLAKE_ACCOUNT` or `SNOWFLAKE_ACCOUNT_URL`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` or `SNOWFLAKE_PRIVATE_KEY_PATH`, `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_SCHEMA`). |
| `SNOWFLAKE_LOG_LEVEL` | No | Set to `VERBOSE` to log the SQL and request JSON. |

## AI_COMPLETE args (function-specific)

Required:
- `model` (string)
- `prompt` (string)

Optional:
- Any extra keys are treated as `AI_COMPLETE` options (for example `temperature`, `max_tokens`, `top_p`, `stop`).
- You can also pass an `options` object; it is merged with any extra keys.

## AI_EXTRACT args (function-specific)

Required:
- `model` (string)
- `text` (string). `prompt` or `input` are accepted aliases.
- `schema` (JSON object or JSON string)

Optional:
- Any extra keys are treated as `AI_EXTRACT` options.
- You can also pass an `options` object; it is merged with any extra keys.

## Usage

```yaml
- name: Run AI_COMPLETE
  id: aicall
  uses: marcelinojackson-org/Snowflake.AISQLAction@v0
  with:
    function: AI_COMPLETE
    args: >
      {
        "model": "snowflake-arctic",
        "prompt": "Write a one paragraph summary of the release notes.",
        "temperature": 0.2,
        "max_tokens": 200
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

## Outputs

- `result-text`: first scalar value returned by the SQL call.
- `result-json`: JSON summary of the SQL call and response rows.
