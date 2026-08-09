import { useEffect, useRef, useState, type ReactNode, type FormEvent, type DragEvent, type KeyboardEvent, type ChangeEvent } from "react";

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

type Stage = keyof typeof stageLabels | string;

interface JobProgress {
  stage: Stage;
  percent: number;
  detail: string;
}

interface TranscriptLine {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

interface Frame {
  filename: string;
  atMs: number;
  caption?: string;
  url: string;
}

interface Highlight {
  atMs: number;
  title: string;
  detail: string;
}

interface Tag {
  label: string;
  category: string;
  atMs: number;
}

interface AnalysisResult {
  title: string;
  durationMs: number;
  summary: string;
  tags: Tag[];
  highlights: Highlight[];
  transcript: TranscriptLine[];
  hasSubtitles?: boolean;
  frames: Frame[];
  videoUrl: string;
}

interface Job {
  id: string;
  source: "upload" | "url";
  title: string;
  createdAt: number;
  expiresAt: number;
  status: "queued" | "processing" | "done" | "failed";
  progress: JobProgress;
  result: AnalysisResult | null;
  error: string | null;
}

function formatTime(milliseconds: number | undefined): string {
  const totalSeconds = Math.max(0, Math.round((milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

type GlyphName = "arrow" | "clock" | "frame" | "info" | "link" | "play" | "spark" | "trash" | "upload" | "voice" | "cc";

function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  const icons: Record<GlyphName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    frame: <><path d="M8 3H4a1 1 0 0 0-1 1v4" /><path d="M16 3h4a1 1 0 0 1 1 1v4" /><path d="M8 21H4a1 1 0 0 1-1-1v-4" /><path d="M16 21h4a1 1 0 0 0 1-1v-4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" /></>,
    play: <path d="m9 7 8 5-8 5Z" />,
    spark: <><path d="m12 3 1.2 4.1a5 5 0 0 0 3.7 3.7L21 12l-4.1 1.2a5 5 0 0 0-3.7 3.7L12 21l-1.2-4.1a5 5 0 0 0-3.7-3.7L3 12l4.1-1.2a5 5 0 0 0 3.7-3.7Z" /></>,
    trash: <><path d="M4 7h16" /><path d="m9 7 1-3h4l1 3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></>,
    voice: <><path d="M9 5v14" /><path d="M5 9v6" /><path d="M13 8v8" /><path d="M17 6v12" /><path d="M21 10v4" /></>,
    cc: <><rect x="2" y="6" width="20" height="12" rx="2.5" /><path d="M8.6 10.2c-.5-.5-1.1-.7-1.7-.7-1.7 0-3 .9-3 2.5s1.3 2.5 3 2.5c.6 0 1.2-.2 1.7-.7" /><path d="M15.6 10.2c-.5-.5-1.1-.7-1.7-.7-1.7 0-3 .9-3 2.5s1.3 2.5 3 2.5c.6 0 1.2-.2 1.7-.7" /></>
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
  const [mode, setMode] = useState<"upload" | "url">("url");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const hasResult = job?.status === "done" && job.result;
  const progress = job?.progress?.percent ?? 0;

  useEffect(() => {
    if (!job?.id || job.status === "done" || job.status === "failed") return undefined;

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error("任务已经消失了");
        setJob(await response.json() as Job);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : String(pollError));
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function startAnalysis(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setJob(null);

    try {
      let response: Response;
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

      const body = await response.json().catch(() => ({})) as { jobId?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "没有成功开始分析");
      const jobResponse = await fetch(`/api/jobs/${body.jobId}`, { cache: "no-store" });
      setJob(await jobResponse.json() as Job);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
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

  async function restartAnalysis() {
    await purgeJob();
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => urlInputRef.current?.focus(), 250);
  }

  function selectFile(nextFile: File | undefined) {
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
              <h1>把一段小视频，<br />拆成几处<br /><span className="slogan-verdict">值得记住的瞬间。</span></h1>
              <p>放进一段小视频。盯帧会抽出关键画面、听写人声、标出重点，再给你一份能直接回看的总结。</p>
              <div className="feature-row">
                <div><Glyph name="frame" /><span><strong>抽关键帧</strong><small>看清发生了什么</small></span></div>
                <div><Glyph name="voice" /><span><strong>逐句字幕</strong><small>听清说了什么</small></span></div>
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
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDrop={(event: DragEvent) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
                >
                  <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0])} />
                  <span className="drop-icon"><Glyph name="upload" size={22} /></span>
                  <strong>{file ? file.name : "拖进来，或点这里选择"}</strong>
                  <small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 已准备好` : "MP4、MOV、WebM · 最长 15 分钟"}</small>
                </div>
              ) : (
                <label className="url-field">
                  <span><Glyph name="link" size={16} />公开的视频地址</span>
                  <input ref={urlInputRef} type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://v.douyin.com/… 或视频直链" />
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
        {hasResult && <ResultView job={job} onClear={purgeJob} onRestart={restartAnalysis} />}
      </main>

      {showSettings && <InfoModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function ProgressView({ job, progress, error, onClear }: { job: Job; progress: number; error: string; onClear: () => void }) {
  return (
    <section className="progress-layout">
      <div className="progress-copy">
        <span className="page-label">ANALYZING · {job.source === "url" ? "REMOTE VIDEO" : "LOCAL VIDEO"}</span>
        <h1>正在把视频<br />整理成结果。</h1>
        <p>声音、画面和时间线正在临时空间里汇合。完成后会自动整理成可以点着回看的结果。</p>
      </div>
      <div className="progress-card">
        <div className="progress-mascot"><img src="/ding-frame-icon.png" alt="" /></div>
        <div className="progress-status"><span>{job.progress ? stageLabels[job.progress.stage as keyof typeof stageLabels] || "处理中" : "处理中"}</span><strong>{progress}%</strong></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <p>{job.progress?.detail || "正在准备…"}</p>
        {error && <div className="inline-error">{error}</div>}
        <div className="process-list"><span className="done">视频已进入临时空间</span><span className={progress >= 35 ? "done" : "current"}>声音与画面分析</span><span className={progress >= 100 ? "done" : "waiting"}>生成可读结果</span></div>
        <button className="text-button" type="button" onClick={onClear}>取消并清除</button>
      </div>
    </section>
  );
}

function FitTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const fit = () => {
      const base = Number.parseFloat(getComputedStyle(element).fontSize) || 43;
      element.style.fontSize = "";
      let size = base;
      const minimum = 24;
      while (size > minimum && element.scrollWidth > element.clientWidth) {
        size -= 1;
        element.style.fontSize = `${size}px`;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [children]);
  return <h1 ref={ref}>{children}</h1>;
}

function ResultView({ job, onClear, onRestart }: { job: Job; onClear: () => void; onRestart: () => void }) {
  const result = job.result as AnalysisResult;
  const [remaining, setRemaining] = useState(Math.max(0, job.expiresAt - Date.now()));
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(Math.max(0, job.expiresAt - Date.now())), 1000);
    return () => window.clearInterval(timer);
  }, [job.expiresAt]);

  const selected = result.frames[selectedFrame] || result.frames[0];

  useEffect(() => {
    // 视频本身没有字幕（无字幕轨、画面也没有烧录字幕）时，自动打开叠加字幕
    setShowSubtitles(!result.hasSubtitles);
  }, [result.hasSubtitles]);

  const activeSubtitle = showSubtitles
    ? (result.transcript || []).find((line) => currentMs >= line.startMs && currentMs < line.endMs)
    : null;
  const countdown = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;

  function syncToTime(atMs: number, shouldPlay = true) {
    const targetMs = Math.min(result.durationMs || atMs, Math.max(0, Number(atMs) || 0));
    const video = videoRef.current;
    const seek = () => {
      const element = videoRef.current;
      if (!element) return;
      element.currentTime = targetMs / 1000;
      if (shouldPlay) element.play().catch(() => undefined);
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
          <div className="result-title"><span className="page-label">分析完成 · {formatDate(job.createdAt)}</span><FitTitle>{result.title || "这段视频，留下了什么？"}</FitTitle></div>
          <div className="result-actions">
            <button className="restart-button" type="button" onClick={onRestart}><Glyph name="arrow" size={15} />重新开始</button>
            <button className="clear-button" type="button" onClick={onClear}><Glyph name="trash" size={16} />清除本次</button>
          </div>
        </div>

        <div className="summary-block"><span><Glyph name="spark" size={15} />AI 视频总结</span><p>{result.summary}</p></div>

        <div className="stat-row"><div><span>视频时长</span><strong>{formatTime(result.durationMs)}</strong></div><div><span>关键画面</span><strong>{result.frames.length}</strong></div><div><span>字幕句数</span><strong>{result.transcript.length}</strong></div><div><span>自动清除</span><strong className="countdown">{countdown}</strong></div></div>

        <section className="tag-panel">
          <div className="section-heading"><span>内容标签</span><small>点击跳到首次出现的位置</small></div>
          <div className="tag-list">{(result.tags || []).map((tag) => <button type="button" className="tag-chip" key={`${tag.category}-${tag.label}`} onClick={() => syncToTime(tag.atMs)}><span>{tag.category}</span>{tag.label}<i>{formatTime(tag.atMs)}</i></button>)}</div>
        </section>

        <div className="video-stage">
          <div className="video-stage-player">
            <video ref={videoRef} src={result.videoUrl} poster={result.frames[0]?.url} controls playsInline preload="metadata" onTimeUpdate={followPlayback} onSeeked={followPlayback}>你的浏览器暂时无法播放这段视频。</video>
            {activeSubtitle && (
              <div className="video-subtitle">
                {activeSubtitle.speaker !== undefined && activeSubtitle.speaker !== null && String(activeSubtitle.speaker).trim() ? <span>说话人 {activeSubtitle.speaker}</span> : null}
                <p>{activeSubtitle.text}</p>
              </div>
            )}
            <button type="button" className={`cc-toggle ${showSubtitles ? "on" : ""}`} aria-pressed={showSubtitles} onClick={() => setShowSubtitles((value) => !value)} title={showSubtitles ? "关闭字幕" : "开启字幕"}>
              <Glyph name="cc" size={13} />字幕
            </button>
          </div>
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

function frameIndexAtTime(frames: Frame[], atMs: number): number {
  let nearest = 0;
  for (let index = 0; index < frames.length; index += 1) {
    if (frames[index].atMs > atMs) break;
    nearest = index;
  }
  return nearest;
}

function InfoModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={onClose} aria-label="关闭">×</button><img src="/ding-frame-icon-64.png" alt="" /><span className="page-label">ABOUT DINGFRAME</span><h2 id="info-title">只留下看懂的结果。</h2><p>视频会暂存在服务端，用来抽帧、听写和回看。中间音频分析后立即删除；视频、关键帧和结果会在倒计时结束或你手动清除时一起消失。</p><p className="modal-muted">无需 Bucket。配置百炼 API Key 后即可使用真实 ASR 与视觉分析；没有配置时会用演示数据跑完整流程。</p><button className="primary-button" type="button" onClick={onClose}>知道了<Glyph name="arrow" size={17} /></button></div></div>;
}

export default App;
