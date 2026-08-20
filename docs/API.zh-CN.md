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
    }
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
  -F 'video=@demo.mp4'
```

`instruction` 最长 4000 字符；`outputSchema` 可以是 JSON 示例或 JSON Schema，最长 12000 字符。两者都可省略，此时运行默认通用总结。

## 读取结果

```bash
curl http://localhost:3000/api/jobs/JOB_ID
```

任务完成后，完整响应的 `result.extractedData` 是按要求提取的数据。若只需要目标 JSON，不要 Koma 的标题、章节等外层结构：

```bash
curl http://localhost:3000/api/jobs/JOB_ID/extraction
```

这个接口原样返回 `extractedData`。任务仍在执行时返回 `409`，任务没有请求自定义提取时返回 `404`，任务到期清理后也返回 `404`。
