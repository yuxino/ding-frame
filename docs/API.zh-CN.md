# HTTP API

Koma 的分析任务是异步的。提交视频后轮询任务，完成后既可以读取完整视频理解结果，也可以只取自定义提取出的 JSON。

## 视频地址

```bash
curl -X POST http://localhost:3000/api/analyze/url \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://example.com/video.mp4",
    "lang": "zh",
    "instruction": "提取所有商品、价格和首次出现时间",
    "outputSchema": {
      "products": [
        { "name": "string", "price": 0, "atMs": 0 }
      ]
    },
    "artifactFormats": ["json", "csv"]
  }'
```

返回 `202`：

```json
{ "jobId": "..." }
```

## 本地上传

multipart 中的文本字段必须放在 `video` 文件字段之前：

```bash
curl -X POST 'http://localhost:3000/api/analyze/upload?lang=zh' \
  -F 'instruction=提取所有商品、价格和首次出现时间' \
  -F 'outputSchema={"products":[{"name":"string","price":0,"atMs":0}]}' \
  -F 'artifactFormats=["json","csv"]' \
  -F 'video=@demo.mp4'
```

`instruction` 最长 4000 字符；`outputSchema` 可以是 JSON 示例或 JSON Schema，最长 12000 字符。`artifactFormats` 支持 `json`、`csv`、`markdown`、`srt` 和 `text`。它们都可省略，此时运行默认通用总结。输出语言直接写在 `instruction` 中，例如“生成中文、英文、日文三份 SRT 字幕”。

## 读取结果

```bash
curl http://localhost:3000/api/jobs/JOB_ID
```

任务完成后，完整响应的 `result.extractedData` 是按要求提取的数据。若只需要目标 JSON，不要 Koma 的标题、章节等外层结构：

```bash
curl http://localhost:3000/api/jobs/JOB_ID/extraction
```

这个接口原样返回 `extractedData`。任务仍在执行时返回 `409`，任务没有请求自定义提取时返回 `404`，任务到期清理后也返回 `404`。

## 下载生成文件

任务响应中的 `result.artifacts` 只包含文件元数据和 `downloadUrl`，不会把大段文件内容嵌进轮询响应：

```json
{
  "name": "products.csv",
  "format": "csv",
  "mimeType": "text/csv; charset=utf-8",
  "sizeBytes": 281,
  "downloadUrl": "/api/jobs/JOB_ID/artifacts/0"
}
```

访问 `downloadUrl` 即可下载。文件与任务一起在 TTL 到期后清理。当前只生成文本类产物，不接受模型返回的 base64 或二进制文件。
