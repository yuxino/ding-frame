import { useEffect, useRef, useState } from "react";

const stageLabels = {
  queued: "排队中",
  resolving: "解析链接",
  downloading: "取回视频",
  inspecting: "读取视频",
  extracting_frames: "抽取画面",
  extracting_audio: "整理声音",
  transcribing: "听写字幕",
  interpreting: "生成总结",
  done: "分析完成",
  failed: "需要重试"
};

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.round((milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function Glyph({ name, size = 18 }) {
  const icons = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    frame: <><path d="M8 3H4a1 1 0 0 0-1 1v4" /><path d="M16 3h4a1 1 0 0 1 1 1v4" /><path d="M8 21H4a1 1 0 0 1-1-1v-4" /><path d="M16 21h4a1 1 0 0 0 1-1v-4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" /></>,
    play: <path d="m9 7 8 5-8 5Z" />,
    spark: <><path d="m12 3 1.2 4.1a5 5 0 0 0 3.7 3.7L21 12l-4.1 1.2a5 5 0 0 0-3.7 3.7L12 21l-1.2-4.1a5 5 0 0 0-3.7-3.7L3 12l4.1-1.2a5 5 0 0 0 3.7-3.7Z" /></>,
    trash: <><path d="M4 7h16" /><path d="m9 7 1-3h4l1 3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></>,
    voice: <><path d="M9 5v14" /><path d="M5 9v6" /><path d="M13 8v8" /><path d="M17 6v12" /><path d="M21 10v4" /></>
  };

  return <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name] || icons.frame}</svg>;
}

function Brand() {
  return <div className="brand-lockup">
    <img src="/ding-frame-icon-64.png" alt="" className="brand-icon" />
    <div><strong>盯帧</strong><span>DINGFRAME</span></div>
  </div>;
}

function App() {
  const [mode, setMode] = useState("url");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef(null);

  const hasResult = job?.status === "done" && job.result;
  const progress = job?.progress?.percent ?? 0;

  useEffect(() => {
    if (!job?.id || ["done", "failed"].includes(job.status)) return undefined;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error("任务已经消失了");
        setJob(await response.json());
      } catch (pollError) {
        setError(pollError.message);
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function startAnalysis(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setJob(null);

    try {
      let response;
      if (mode === "upload") {
        if (!file) throw new Error("先放入一个小视频");
        const formData = new FormData();
        formData.append("video", file);
        response = await fetch("/api/analyze/upload", { method: "POST", body: formData });
      } else {
        if (!url.trim()) throw new Error("先粘贴一个视频地址");
        response = await fetch("/api/analyze/url", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: url.trim() })
        });
      }

      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "没有成功开始分析");
      const jobResponse = await fetch(`/api/jobs/${body.jobId}`, { cache: "no-store" });
      setJob(await jobResponse.json());
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  async function purgeJob() {
    if (!job?.id) return;
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    setJob(null);
    setFile(null);
    setUrl("");
  }

  function selectFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setError("");
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Brand />
          <div className="header-actions">
            <span className="privacy-pill"><i />20 分钟后自动消失</span>
            <button className="header-button" type="button" onClick={() => setShowSettings(true)}><Glyph name="info" size={16} />使用说明</button>
          </div>
        </div>
      </header>

      <main className="main-shell">
        {!job && (
          <section className="landing-layout">
            <div className="hero-copy">
              <div className="hero-badge"><span />小视频分析，不留库存</div>
              <h1>一眼盯帧，<br />鉴定为：<br /><span className="slogan-verdict">纯纯的好活。</span></h1>
              <p>放进一段小视频。盯帧会抽出关键画面、听写人声、标出重点，再给你一份能直接回看的总结。</p>
              <div className="feature-row">
                <div><Glyph name="frame" /><span><strong>抽关键帧</strong><small>看清发生了什么</small></span></div>
                <div><Glyph name="voice" /><span><strong>分钟字幕</strong><small>听清说了什么</small></span></div>
                <div><Glyph name="clock" /><span><strong>阅后即焚</strong><small>不占长期空间</small></span></div>
              </div>
            </div>

            <form className="capture-card" onSubmit={startAnalysis}>
              <div className="capture-card-head">
                <div><span>NEW ANALYSIS</span><h2>开始一次分析</h2></div>
                <img src="/ding-frame-icon-64.png" alt="" />
              </div>
              <div className="mode-switch" role="tablist" aria-label="视频来源">
                <button className={mode === "upload" ? "selected" : ""} type="button" onClick={() => setMode("upload")}><Glyph name="upload" size={15} />本地视频</button>
                <button className={mode === "url" ? "selected" : ""} type="button" onClick={() => setMode("url")}><Glyph name="link" size={15} />视频地址</button>
              </div>
              {mode === "upload" ? (
                <div
                  className={`drop-zone ${file ? "has-file" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}
                  role="button"
                  tabIndex="0"
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
                >
                  <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
                  <span className="drop-icon"><Glyph name="upload" size={22} /></span>
                  <strong>{file ? file.name : "拖进来，或点这里选择"}</strong>
                  <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 已准备好` : "MP4、MOV、WebM · 最长 15 分钟"}</small>
                </div>
              ) : (
                <label className="url-field">
                  <span><Glyph name="link" size={16} />公开的视频地址</span>
                  <input type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://v.douyin.com/… 或视频直链" />
                  <small>支持抖音分享链接、整段分享文案、B站/YouTube 等公开链接与视频直链</small>
                </label>
              )}
              <div className="capture-foot">
                <span><i />仅在分析期间暂存</span>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? "正在放入…" : "开始分析"}<Glyph name="arrow" size={17} /></button>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
            </form>
          </section>
        )}

        {job && !hasResult && <ProgressView job={job} progress={progress} error={error} onClear={purgeJob} />}
        {hasResult && <ResultView job={job} onClear={purgeJob} />}
      </main>

      {showSettings && <InfoModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function ProgressView({ job, progress, error, onClear }) {
  return (
    <section className="progress-layout">
      <div className="progress-copy">
        <span className="page-label">ANALYZING · {job.source === "url" ? "REMOTE VIDEO" : "LOCAL VIDEO"}</span>
        <h1>正在把视频<br />盯明白。</h1>
        <p>声音、画面和时间线正在临时空间里汇合。完成后会自动整理成可以点着回看的结果。</p>
      </div>
      <div className="progress-card">
        <div className="progress-mascot"><img src="/ding-frame-icon.png" alt="" /></div>
        <div className="progress-status"><span>{stageLabels[job.progress?.stage] || "处理中"}</span><strong>{progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <p>{job.progress?.detail || "正在准备…"}</p>
        {error && <div className="inline-error">{error}</div>}
        <div className="process-list"><span className="done">视频已进入临时空间</span><span className={progress >= 35 ? "done" : "current"}>声音与画面分析</span><span className={progress >= 100 ? "done" : "waiting"}>生成可读结果</span></div>
        <button className="text-button" type="button" onClick={onClear}>取消并清除</button>
      </div>
    </section>
  );
}

function ResultView({ job, onClear }) {
  const [remaining, setRemaining] = useState(Math.max(0, job.expiresAt - Date.now()));
  const result = job.result;
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const videoRef = useRef(null);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, job.expiresAt - Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [job.expiresAt]);

  const selected = result.frames[selectedFrame] || result.frames[0];
  const countdown = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;
  const activeMinute = Math.floor(currentMs / 60000);

  function syncToTime(atMs, shouldPlay = true) {
    const targetMs = Math.min(result.durationMs || atMs, Math.max(0, Number(atMs) || 0));
    const video = videoRef.current;
    const seek = () => {
      video.currentTime = targetMs / 1000;
      if (shouldPlay) video.play().catch(() => undefined);
    };
    if (video) {
      if (video.readyState >= 1) seek();
      else video.addEventListener("loadedmetadata", seek, { once: true });
    }
    setCurrentMs(targetMs);
    setSelectedFrame(frameIndexAtTime(result.frames, targetMs));
  }

  function followPlayback() {
    const nextMs = Math.round((videoRef.current?.currentTime || 0) * 1000);
    setCurrentMs(nextMs);
    setSelectedFrame(frameIndexAtTime(result.frames, nextMs));
  }

  return (
    <section className="result-layout">
      <div className="result-main">
        <div className="result-heading">
          <div className="result-title"><span className="page-label">分析完成 · {formatDate(job.createdAt)}</span><h1>{result.title || "这段视频，留下了什么？"}</h1></div>
          <button className="clear-button" type="button" onClick={onClear}><Glyph name="trash" size={16} />清除本次</button>
        </div>

        <div className="summary-block"><span><Glyph name="spark" size={15} />AI 视频总结</span><p>{result.summary}</p></div>

        <div className="stat-row"><div><span>视频时长</span><strong>{formatTime(result.durationMs)}</strong></div><div><span>关键画面</span><strong>{result.frames.length}</strong></div><div><span>字幕句数</span><strong>{result.transcript.length}</strong></div><div><span>自动清除</span><strong className="countdown">{countdown}</strong></div></div>

        <section className="tag-panel">
          <div className="section-heading"><span>内容标签</span><small>点击跳到首次出现的位置</small></div>
          <div className="tag-list">{(result.tags || []).map((tag) => <button type="button" className="tag-chip" key={`${tag.category}-${tag.label}`} onClick={() => syncToTime(tag.atMs)}><span>{tag.category}</span>{tag.label}<i>{formatTime(tag.atMs)}</i></button>)}</div>
        </section>

        <div className="video-stage">
          <video ref={videoRef} src={result.videoUrl} poster={result.frames[0]?.url} controls playsInline preload="metadata" onTimeUpdate={followPlayback} onSeeked={followPlayback}>你的浏览器暂时无法播放这段视频。</video>
          <div className="video-stage-caption"><span>{selected?.caption || "正在回看视频"}</span><span>{formatTime(currentMs)} / {formatTime(result.durationMs)}</span></div>
        </div>

        <div className="frame-strip" aria-label="关键帧时间线">{result.frames.map((frame, index) => <button key={frame.url} type="button" aria-label={`跳到 ${formatTime(frame.atMs)}：${frame.caption || "关键帧"}`} className={index === selectedFrame ? "active" : ""} onClick={() => syncToTime(frame.atMs)}><img src={frame.url} alt="" /><span>{formatTime(frame.atMs)}</span></button>)}</div>

        <section className="highlights">
          <div className="section-heading"><span>值得回看的瞬间</span><small>{result.highlights.length} 个重点</small></div>
          {result.highlights.map((highlight) => <button type="button" className="highlight" key={`${highlight.atMs}-${highlight.title}`} onClick={() => syncToTime(highlight.atMs)}><span className="highlight-time"><Glyph name="play" size={13} />{formatTime(highlight.atMs)}</span><span><strong>{highlight.title}</strong><p>{highlight.detail}</p></span><Glyph name="arrow" size={18} /></button>)}
        </section>
      </div>

      <aside className="transcript-panel">
        <div className="panel-heading"><div><span className="page-label">SUBTITLES</span><h2>字幕</h2><p>每句一行，带说话人标签，点击直接回看。</p></div><span className="live-dot" /></div>
        <div className="transcript-list">
          {result.transcript.length ? result.transcript.map((line, index) => {
            const active = currentMs >= line.startMs && currentMs < line.endMs;
            const speaker = line.speaker !== undefined && line.speaker !== null && String(line.speaker).trim() ? `说话人 ${line.speaker}` : "人声";
            return <button type="button" className={`transcript-line ${active ? "active" : ""}`} aria-pressed={active} key={`${line.startMs}-${index}`} onClick={() => syncToTime(line.startMs)}>
              <span className="line-rail"><strong>{formatTime(line.startMs)}</strong><i>{formatTime(line.endMs)}</i></span>
              <span className="line-body"><small><i />{speaker}</small><p>{line.text}</p><em><Glyph name="play" size={11} />从 {formatTime(line.startMs)} 播放</em></span>
            </button>;
          }) : <div className="transcript-empty">这段视频没有识别到可用人声。</div>}
        </div>
        <div className="panel-note"><Glyph name="clock" size={14} />剩余 {Math.ceil(remaining / 60000)} 分钟，到时自动清除</div>
      </aside>
    </section>
  );
}

function frameIndexAtTime(frames, atMs) {
  let nearest = 0;
  for (let index = 0; index < frames.length; index += 1) {
    if (frames[index].atMs > atMs) break;
    nearest = index;
  }
  return nearest;
}

function InfoModal({ onClose }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button><img src="/ding-frame-icon-64.png" alt="" /><span className="page-label">ABOUT DINGFRAME</span><h2 id="info-title">只留下看懂的结果。</h2><p>视频会暂存在服务端，用来抽帧、听写和回看。中间音频分析后立即删除；视频、关键帧和结果会在倒计时结束或你手动清除时一起消失。</p><p className="modal-muted">无需 Bucket。配置百炼 API Key 后即可使用真实 ASR 与视觉分析；没有配置时会用演示数据跑完整流程。</p><button className="primary-button" type="button" onClick={onClose}>知道了<Glyph name="arrow" size={17} /></button></div></div>;
}

export default App;
