import { useEffect, useMemo, useRef, useState } from "react";
import { groupTranscriptByMinute } from "./transcript.js";

const stageLabels = {
  queued: "排队中",
  downloading: "取回视频",
  inspecting: "读取视频",
  extracting_frames: "抽取画面",
  extracting_audio: "整理声音",
  transcribing: "听写字幕",
  interpreting: "整理线索",
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

function App() {
  const [mode, setMode] = useState("upload");
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
      <aside className="rail" aria-label="主导航">
        <div>
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">盯</span>
            <div>
              <div className="brand-name">盯帧</div>
              <div className="brand-tagline">一眼盯帧，鉴定为真</div>
            </div>
          </div>
          <nav className="rail-nav">
            <button className="rail-button active" type="button">
              <span className="rail-icon">⌁</span><span className="rail-label">开始分析</span>
            </button>
            <button className="rail-button" type="button" onClick={() => setShowSettings(true)}>
              <span className="rail-icon">◌</span><span className="rail-label">使用说明</span>
            </button>
          </nav>
        </div>
        <div className="rail-bottom">
          <div className="streak-note"><span className="pulse-dot" /><span>结果会自行消失</span></div>
          <button className="avatar-button" type="button" aria-label="关于盯帧" onClick={() => setShowSettings(true)}>G</button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="crumbs"><span className="crumb-muted">小视频工作台</span><span className="crumb-slash">/</span><span>{hasResult ? "一次分析" : "新的分析"}</span></div>
          <div className="topbar-actions">
            <span className="preview-chip"><span className="preview-dot" />临时空间</span>
            <button className="topbar-button" type="button" onClick={() => setShowSettings(true)}><span className="button-glyph">✦</span>阅后即焚</button>
          </div>
        </header>

        {!job && (
          <section className="landing-layout">
            <div className="hero-copy">
              <div className="eyebrow">一眼盯帧 · 鉴定为真</div>
              <h1>把一段小视频，<br /><em>拆成几处</em>值得记住的瞬间。</h1>
              <p className="hero-deck">抽出画面，听见人声，再把它们排回时间线上。视频本体不进你的长期空间。</p>
              <div className="hero-meta"><span>抽帧</span><i>·</i><span>ASR 听写</span><i>·</i><span>临时结果</span></div>
            </div>

            <form className="capture-card" onSubmit={startAnalysis}>
              <div className="capture-card-head"><span className="card-kicker">放入一段视频</span><span className="card-hint">≤ 15 分钟</span></div>
              <div className="mode-switch" role="tablist" aria-label="视频来源">
                <button className={mode === "upload" ? "selected" : ""} type="button" onClick={() => setMode("upload")}>本地视频</button>
                <button className={mode === "url" ? "selected" : ""} type="button" onClick={() => setMode("url")}>视频地址</button>
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
                  <div className="drop-orbit"><span>↥</span></div>
                  <strong>{file ? file.name : "拖进来，或点这里选择"}</strong>
                  <span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 等待分析` : "视频只会暂存在分析期间"}</span>
                </div>
              ) : (
                <label className="url-field">
                  <span>公开的视频 URL</span>
                  <input type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://… 或 //www.douyin.com/…" />
                  <small>支持完整链接、// 开头或省略协议的视频地址</small>
                </label>
              )}
              <div className="capture-foot"><span><span className="tiny-star">✦</span>结果到期后自动清除视频与分析文件</span><button className="primary-button" type="submit" disabled={busy}>{busy ? "正在放入…" : "开始拆解"}<span>→</span></button></div>
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
      <div className="progress-intro"><div className="eyebrow">正在理解 · {job.source === "url" ? "视频地址" : "本地视频"}</div><h1>先把声音和画面，<em>分开听一遍。</em></h1><p>分析会在临时空间完成。你可以离开页面，回来后这次结果仍会在短时间内等你。</p><button className="quiet-button" type="button" onClick={onClear}>取消并清除</button></div>
      <div className="progress-card">
        <div className="progress-orbit"><span /><i /><b /></div>
        <div className="progress-status"><span>{stageLabels[job.progress?.stage] || "处理中"}</span><strong>{progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <p>{job.progress?.detail || "正在准备…"}</p>
        {error && <div className="inline-error">{error}</div>}
        <div className="process-list"><div className="process-done">① 视频已放入临时空间</div><div className={progress >= 35 ? "process-done" : "process-current"}>② {stageLabels[job.progress?.stage] || "分析处理中"}</div><div className={progress >= 100 ? "process-done" : "process-waiting"}>③ 整理成可读的时间线</div></div>
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
  const transcriptMinutes = useMemo(() => groupTranscriptByMinute(result.transcript, result.durationMs), [result.durationMs, result.transcript]);
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
        <div className="result-heading"><div><div className="eyebrow">分析完成 · {formatDate(job.createdAt)}</div><h1>{result.title || "这段视频，留下了什么？"}</h1><div className="summary-block"><span>AI 视频总结</span><p className="result-deck">{result.summary}</p></div></div><button className="quiet-button danger" type="button" onClick={onClear}>立即清除</button></div>
        <div className="stat-row"><div><span>视频时长</span><strong>{formatTime(result.durationMs)}</strong></div><div><span>抽取画面</span><strong>{result.frames.length} 帧</strong></div><div><span>字幕分钟</span><strong>{transcriptMinutes.length} 格</strong></div><div className="expiry-stat"><span>自动消失</span><strong>{countdown}</strong></div></div>
        <div className="tag-panel">
          <div className="tag-panel-copy"><span className="section-kicker">内容标记</span><p>主体、场景、动作和气氛；点标签就去它第一次出现的地方。</p></div>
          <div className="tag-list">{(result.tags || []).map((tag) => <button type="button" className="tag-chip" key={`${tag.category}-${tag.label}`} onClick={() => syncToTime(tag.atMs)}><span>{tag.category}</span>{tag.label}<i>{formatTime(tag.atMs)}</i></button>)}</div>
        </div>
        <div className="video-stage">
          <video ref={videoRef} src={result.videoUrl} poster={result.frames[0]?.url} controls playsInline preload="metadata" onTimeUpdate={followPlayback} onSeeked={followPlayback}>你的浏览器暂时无法播放这段视频。</video>
          <div className="video-stage-caption"><span>{selected?.caption || "正在回看视频"}</span><span>{formatTime(currentMs)} / {formatTime(result.durationMs)}</span></div>
        </div>
        <div className="frame-strip" aria-label="关键帧时间线">{result.frames.map((frame, index) => <button key={frame.url} type="button" aria-label={`跳到 ${formatTime(frame.atMs)}：${frame.caption || "关键帧"}`} className={index === selectedFrame ? "active" : ""} onClick={() => syncToTime(frame.atMs)}><img src={frame.url} alt="" /><span>{formatTime(frame.atMs)}</span></button>)}</div>
        <div className="highlights"><div className="section-kicker">值得回看的几个瞬间</div>{result.highlights.map((highlight) => <button type="button" className="highlight" key={`${highlight.atMs}-${highlight.title}`} onClick={() => syncToTime(highlight.atMs)}><div className="highlight-time"><span>▶</span>{formatTime(highlight.atMs)}</div><div><h3>{highlight.title}</h3><p>{highlight.detail}</p></div></button>)}</div>
      </div>
      <aside className="transcript-panel">
        <div className="panel-heading"><div><span className="panel-kicker">分钟字幕</span><h2>一分一格，点时回看</h2></div><span className="live-dot" /></div>
        <div className="transcript-list">
          {transcriptMinutes.length ? transcriptMinutes.map((group) => {
            const active = group.minute === activeMinute;
            return <button type="button" className={`transcript-minute ${active ? "active" : ""}`} aria-pressed={active} key={group.minute} onClick={() => syncToTime(group.startMs)}>
              <span className="minute-rail"><strong>{String(group.minute + 1).padStart(2, "0")}′</strong><i>{formatTime(group.startMs)}—{formatTime(group.endMs)}</i></span>
              <span className="minute-subtitle"><small><b />{group.speakerLabel}</small><p>{group.text}</p><em>▶ 从 {formatTime(group.startMs)} 播放</em></span>
            </button>;
          }) : <div className="transcript-empty">这段视频没有识别到可用人声。</div>}
        </div>
        <div className="panel-note"><span className="tiny-star">✦</span>视频、抽帧和结果还会停留 {Math.ceil(remaining / 60000)} 分钟<br />到时一起离开。</div>
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
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button><span className="panel-kicker">盯帧 · 小说明</span><h2 id="info-title">让视频停在临时空间里。</h2><p>本地视频会上传到服务端临时目录，视频地址会被服务端短暂取回。分析结束后只保留回看需要的视频、抽帧和文本，倒计时结束或手动清除时一起删除；中间音频会在分析后立即删除。</p><p className="modal-muted">没有配置模型密钥时，项目会用演示数据跑完整流程。配置百炼通用 API Key 后，千问 ASR 与视觉模型会直接理解声音和画面，全程不需要 Bucket。</p><button className="primary-button" type="button" onClick={onClose}>知道了 <span>→</span></button></div></div>;
}

export default App;
