# HTTP API

Koma analysis jobs are asynchronous. Submit a video, poll the job, then retrieve either the complete video-understanding result or only the requested JSON.

## Video URL

```bash
curl -X POST http://localhost:3000/api/analyze/url \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://example.com/video.mp4",
    "lang": "en",
    "instruction": "Extract every product, price, and first appearance time",
    "outputSchema": {
      "products": [
        { "name": "string", "price": 0, "atMs": 0 }
      ]
    },
    "artifactFormats": ["json", "csv"]
  }'
```

The endpoint responds with `202`:

```json
{ "jobId": "..." }
```

## Local upload

Multipart text fields must appear before the `video` file field:

```bash
curl -X POST 'http://localhost:3000/api/analyze/upload?lang=en' \
  -F 'instruction=Extract every product, price, and first appearance time' \
  -F 'outputSchema={"products":[{"name":"string","price":0,"atMs":0}]}' \
  -F 'artifactFormats=["json","csv"]' \
  -F 'video=@demo.mp4'
```

`instruction` is limited to 4,000 characters. `outputSchema` can be a JSON example or JSON Schema and is limited to 12,000 characters. `artifactFormats` accepts `json`, `csv`, `markdown`, `srt`, and `text`. All are optional; omit them for the default general summary. Put output-language requirements directly in `instruction`, for example: “Generate separate Chinese, English, and Japanese SRT subtitle files.”

## Retrieve results

```bash
curl http://localhost:3000/api/jobs/JOB_ID
```

When the job is done, `result.extractedData` contains the requested data. To retrieve that JSON value without Koma's title, chapters, and other wrapper fields:

```bash
curl http://localhost:3000/api/jobs/JOB_ID/extraction
```

This endpoint returns `extractedData` exactly. It returns `409` while the job is running, `404` when custom extraction was not requested, and `404` after the job expires.

## Download generated files

`result.artifacts` in the job response contains metadata and a `downloadUrl`, not the potentially large file body:

```json
{
  "name": "products.csv",
  "format": "csv",
  "mimeType": "text/csv; charset=utf-8",
  "sizeBytes": 281,
  "downloadUrl": "/api/jobs/JOB_ID/artifacts/0"
}
```

Fetch `downloadUrl` to download the file. Artifacts expire with the job TTL. Koma currently generates text artifacts only; model-supplied base64 and binary files are not accepted.
