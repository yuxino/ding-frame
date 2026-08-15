import { useEffect, useRef, useState, type ReactNode, type FormEvent, type DragEvent, type KeyboardEvent, type ChangeEvent } from "react";
import { translateServerError } from "./errors.js";
import { formatTime } from "./format.js";

type Language = "en" | "zh";

type Stage = "queued" | "resolving" | "downloading" | "inspecting" | "extracting_frames" | "extracting_audio" | "transcribing" | "interpreting" | "done" | "failed" | string;

const copy = {
  en: {
    stage: {
      queued: "Queued",
      resolving: "Resolving link",
      downloading: "Fetching video",
      inspecting: "Reading video",
      extracting_frames: "Extracting frames",
      extracting_audio: "Preparing audio",
      transcribing: "Transcribing",
      interpreting: "Generating summary",
      done: "Complete",
      failed: "Try again"
    } as Record<string, string>,
    privacy: "Auto-deletes after 20 minutes",
    help: "How it works",
    badge: "AI VIDEO UNDERSTANDING",
    hero: "Understand a video from the moments that matter.",
    intro: "Drop in a video. Koma pulls out key frames, transcribes speech, finds important moments, and turns everything into a timeline you can jump through.",
    keyFrames: "Key frames",
    keyFramesSub: "See what matters",
    subtitles: "Subtitles",
    subtitlesSub: "Find exact moments",
    cleanup: "Auto cleanup",
    cleanupSub: "Nothing kept long-term",
    newAnalysis: "NEW ANALYSIS",
    startOne: "Start an analysis",
    sourceLabel: "Video source",
    upload: "Upload",
    videoUrl: "Video URL",
    drop: "Drop a video here, or choose a file",
    ready: "Ready",
    fileHint: "MP4, MOV, WebM · up to 15 minutes",
    publicUrl: "Public video URL",
    urlPlaceholder: "https://v.douyin.com/… or a direct video URL",
    urlHint: "Supports Douyin share links, Bilibili, YouTube and other public video URLs.",
    temporary: "Stored only while processing",
    starting: "Starting…",
    start: "Analyze video",
    retry: "Try again",
    uploading: "Uploading",
    uploadProgress: "Uploading video",
    missingFile: "Choose a video first.",
    missingUrl: "Paste a video URL first.",
    startFailed: "Could not start the analysis.",
    jobMissing: "This analysis is no longer available.",
    analyzingRemote: "ANALYZING · REMOTE VIDEO",
    analyzingLocal: "ANALYZING · LOCAL VIDEO",
    progressTitle: "Turning this video into something you can scan.",
    progressText: "Audio, frames, and timing are being combined into one result you can jump through.",
    processing: "Processing",
    preparing: "Preparing…",
    entered: "Video received",
    mediaAnalysis: "Analyzing audio and visuals",
    readableResult: "Building the result",
    cancel: "Cancel and clear",
    completed: "ANALYSIS COMPLETE",
    resultFallback: "What is worth remembering from this video?",
    restart: "Start over",
    clear: "Clear",
    aiSummary: "AI SUMMARY",
    duration: "Duration",
    frames: "Key frames",
    subtitleLines: "Subtitle lines",
    autoDelete: "Auto delete",
    contentTags: "Content tags",
    jumpTag: "Click to jump to the first appearance",
    browserNoVideo: "Your browser cannot play this video.",
    speaker: "Speaker",
    voice: "Voice",
    subtitlesToggle: "Subtitles",
    subtitlesOn: "Turn subtitles off",
    subtitlesOff: "Turn subtitles on",
    reviewing: "Reviewing video",
    frameTimeline: "Key frame timeline",
    jumpTo: "Jump to",
    keyFrame: "key frame",
    chapters: "Chapter summary",
    chaptersSub: "Click a chapter to jump to that part of the video",
    chaptersCount: "chapters",
    noChapters: "No chapter summary was generated for this video.",
    backHome: "Back to home",
    subtitlePanel: "Subtitles",
    subtitlePanelText: "One line at a time. Click any subtitle to jump back to it.",
    playFrom: "Play from",
    noSpeech: "No usable speech was detected in this video.",
    remaining: "minutes until automatic cleanup",
    close: "Close",
    aboutTitle: "AI video understanding, without the clutter.",
    aboutText: "Koma temporarily stores the video while extracting frames, transcribing audio, and letting you review the result. Intermediate audio is deleted after analysis; the video, frames, and result disappear when the timer ends or when you clear them.",
    aboutMuted: "Configure an Alibaba Cloud Model Studio API key for real ASR and vision analysis. Without one, Koma runs the full flow with demo data.",
    gotIt: "Got it",
    language: "中文"
  },
  zh: {
    stage: {
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
    } as Record<string, string>,
    privacy: "20 分钟后自动消失",
    help: "使用说明",
    badge: "AI 视频理解",
    hero: "从关键瞬间，看懂一段视频。",
    intro: "放入一段视频。Koma 会提取关键画面、转写语音、标出重点，并整理成一条可以直接跳转回看的时间线。",
    keyFrames: "关键帧",
    keyFramesSub: "快速理解画面",
    subtitles: "逐句字幕",
    subtitlesSub: "准确定位内容",
    cleanup: "自动清理",
    cleanupSub: "不长期保存视频",
    newAnalysis: "NEW ANALYSIS",
    startOne: "开始一次分析",
    sourceLabel: "视频来源",
    upload: "本地视频",
    videoUrl: "视频地址",
    drop: "拖进来，或点这里选择",
    ready: "已准备好",
    fileHint: "MP4、MOV、WebM · 最长 15 分钟",
    publicUrl: "公开的视频地址",
    urlPlaceholder: "https://v.douyin.com/… 或视频直链",
    urlHint: "支持抖音分享链接、B站、YouTube 等公开链接与视频直链。",
    temporary: "仅在分析期间暂存",
    starting: "正在放入…",
    start: "开始分析",
    retry: "重试",
    uploading: "正在上传",
    uploadProgress: "正在上传视频",
    missingFile: "先放入一个小视频",
    missingUrl: "先粘贴一个视频地址",
    startFailed: "没有成功开始分析",
    jobMissing: "任务已经消失了",
    analyzingRemote: "ANALYZING · REMOTE VIDEO",
    analyzingLocal: "ANALYZING · LOCAL VIDEO",
    progressTitle: "正在把视频整理成可读结果。",
    progressText: "声音、画面和时间线正在临时空间里汇合，完成后可以直接点着回看。",
    processing: "处理中",
    preparing: "正在准备…",
    entered: "视频已进入临时空间",
    mediaAnalysis: "声音与画面分析",
    readableResult: "生成可读结果",
    cancel: "取消并清除",
    completed: "分析完成",
    resultFallback: "这段视频，留下了什么？",
    restart: "重新开始",
    clear: "清除本次",
    aiSummary: "AI 视频总结",
    duration: "视频时长",
    frames: "关键画面",
    subtitleLines: "字幕句数",
    autoDelete: "自动清除",
    contentTags: "内容标签",
    jumpTag: "点击跳到首次出现的位置",
    browserNoVideo: "你的浏览器暂时无法播放这段视频。",
    speaker: "说话人",
    voice: "人声",
    subtitlesToggle: "字幕",
    subtitlesOn: "关闭字幕",
    subtitlesOff: "开启字幕",
    reviewing: "正在回看视频",
    frameTimeline: "关键帧时间线",
    jumpTo: "跳到",
    keyFrame: "关键帧",
    chapters: "内容章节",
    chaptersSub: "点击章节跳到对应内容",
    chaptersCount: "个章节",
    noChapters: "这次没有生成章节总结。",
    backHome: "回到首页",
    subtitlePanel: "字幕",
    subtitlePanelText: "每句一行，点击直接跳回对应位置。",
    playFrom: "从",
    noSpeech: "这段视频没有识别到可用人声。",
    remaining: "分钟后自动清除",
    close: "关闭",
    aboutTitle: "AI 视频理解工作台",
    aboutText: "视频会暂存在服务端，用于抽帧、听写和回看。中间音频分析后立即删除；视频、关键帧和结果会在倒计时结束或你手动清除时一起删除。",
    aboutMuted: "配置百炼 API Key 后即可使用真实 ASR 与视觉分析；没有配置时会使用演示数据运行完整流程。",
    gotIt: "知道了",
    language: "EN"
  }
} as const;

interface JobProgress { stage: Stage; percent: number; detail: string; }
interface TranscriptLine { startMs: number; endMs: number; text: string; speaker?: string; }
interface Frame { filename: string; atMs: number; caption?: string; url: string; }
interface Chapter { startMs: number; endMs: number; title: string; summary: string; }
interface Tag { label: string; category: string; atMs: number; }
interface AnalysisResult { title: string; durationMs: number; summary: string; tags: Tag[]; chapters: Chapter[]; transcript: TranscriptLine[]; hasSubtitles?: boolean; frames: Frame[]; videoUrl: string; }
interface Job { id: string; source: "upload" | "url"; title: string; createdAt: number; expiresAt: number; status: "queued" | "processing" | "done" | "failed"; progress: JobProgress; result: AnalysisResult | null; error: string | null; }

function formatDate(timestamp: number, language: Language): string {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}

type GlyphName = "arrow" | "clock" | "frame" | "info" | "link" | "play" | "spark" | "trash" | "upload" | "voice" | "cc";
function Glyph({ name, size = 18 }: { name: GlyphName; size?: number }) {
  const icons: Record<GlyphName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></>, clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    frame: <><path d="M8 3H4a1 1 0 0 0-1 1v4" /><path d="M16 3h4a1 1 0 0 1 1 1v4" /><path d="M8 21H4a1 1 0 0 1-1-1v-4" /><path d="M16 21h4a1 1 0 0 0 1-1v-4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>, link: <><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" /></>,
    play: <path d="m9 7 8 5-8 5Z" />, spark: <><path d="m12 3 1.2 4.1a5 5 0 0 0 3.7 3.7L21 12l-4.1 1.2a5 5 0 0 0-3.7 3.7L12 21l-1.2-4.1a5 5 0 0 0-3.7-3.7L3 12l4.1-1.2a5 5 0 0 0 3.7-3.7Z" /></>,
    trash: <><path d="M4 7h16" /><path d="m9 7 1-3h4l1 3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></>, upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" /></>,
    voice: <><path d="M9 5v14" /><path d="M5 9v6" /><path d="M13 8v8" /><path d="M17 6v12" /><path d="M21 10v4" /></>, cc: <><rect x="2" y="6" width="20" height="12" rx="2.5" /><path d="M8.6 10.2c-.5-.5-1.1-.7-1.7-.7-1.7 0-3 .9-3 2.5s1.3 2.5 3 2.5c.6 0 1.2-.2 1.7-.7" /><path d="M15.6 10.2c-.5-.5-1.1-.7-1.7-.7-1.7 0-3 .9-3 2.5s1.3 2.5 3 2.5c.6 0 1.2-.2 1.7-.7" /></>
  };
  return <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function Brand({ onClick, label }: { onClick?: () => void; label?: string }) {
  return onClick
    ? <button type="button" className="brand-lockup brand-button" onClick={onClick} aria-label={label}><img src="/koma-icon-64.png" alt="" className="brand-icon" /><span className="brand-text"><strong>Koma</strong><span>KOMA</span></span></button>
    : <div className="brand-lockup"><img src="/koma-icon-64.png" alt="" className="brand-icon" /><div><strong>Koma</strong><span>KOMA</span></div></div>;
}

function App() {
  const [language, setLanguage] = useState<Language>(() => window.localStorage.getItem("koma-language") === "zh" ? "zh" : "en");
  const t = copy[language];
  const [mode, setMode] = useState<"upload" | "url">("url");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const hasResult = job?.status === "done" && job.result;
  const progress = job?.progress?.percent ?? 0;

  useEffect(() => {
    window.localStorage.setItem("koma-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh" ? "Koma — AI 视频理解" : "Koma — AI Video Understanding";
  }, [language]);

  useEffect(() => {
    if (!job?.id || job.status === "done" || job.status === "failed") return undefined;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
        if (response.status === 404) {
          // 任务已过期或被清除：停止轮询，标记为失败而不是每 1.2 秒重复报错。
          setJob((current) => current ? { ...current, status: "failed", error: t.jobMissing } : current);
          return;
        }
        if (!response.ok) throw new Error(t.jobMissing);
        setJob(await response.json() as Job);
      } catch (pollError) { setError(translateServerError(pollError instanceof Error ? pollError.message : String(pollError), language)); }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, language, t.jobMissing]);

  async function startAnalysis(event?: FormEvent) {
    event?.preventDefault(); setBusy(true); setError(""); setJob(null); setUploadPercent(null);
    try {
      if (mode === "upload") {
        if (!file) throw new Error(t.missingFile);
        const jobId = await uploadWithProgress(file);
        const jobResponse = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        setJob(await jobResponse.json() as Job);
      } else {
        if (!url.trim()) throw new Error(t.missingUrl);
        const response = await fetch("/api/analyze/url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.trim(), lang: language }) });
        const body = await response.json().catch(() => ({})) as { jobId?: string; error?: string };
        if (!response.ok) throw new Error(body.error || t.startFailed);
        const jobResponse = await fetch(`/api/jobs/${body.jobId}`, { cache: "no-store" });
        setJob(await jobResponse.json() as Job);
      }
    } catch (submitError) {
      setError(translateServerError(submitError instanceof Error ? submitError.message : String(submitError), language));
    } finally { setBusy(false); setUploadPercent(null); }
  }

  // 用 XMLHttpRequest 上传以拿到真实进度；返回创建的任务 id。
  function uploadWithProgress(video: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/analyze/upload?lang=${language}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadPercent(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        let body: { jobId?: string; error?: string } = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* 保留空对象走错误分支 */ }
        if (xhr.status >= 200 && xhr.status < 300 && body.jobId) return resolve(body.jobId);
        reject(new Error(body.error || t.startFailed));
      };
      xhr.onerror = () => reject(new Error(t.startFailed));
      const formData = new FormData();
      formData.append("video", video);
      xhr.send(formData);
    });
  }

  async function retryAnalysis() {
    // 失败后重试：重新提交同一个来源（本地文件或视频地址）。
    await startAnalysis();
  }

  async function purgeJob() { if (!job?.id) return; await fetch(`/api/jobs/${job.id}`, { method: "DELETE" }); setJob(null); setFile(null); setUrl(""); }
  async function restartAnalysis() { await purgeJob(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  // 回到 landing 后把焦点放到 URL 输入框（结果页点“重新开始”时），
  // 用 effect 而不是 setTimeout 猜渲染时机。
  const wasInResult = useRef(false);
  useEffect(() => {
    if (wasInResult.current && !job) urlInputRef.current?.focus();
    wasInResult.current = Boolean(job);
  }, [job]);
  // 点 Logo 回到首页：清掉当前任务视图但不删除服务端数据（让它按 TTL 自然清理）。
  function goHome() { setJob(null); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function selectFile(nextFile: File | undefined) { if (!nextFile) return; setFile(nextFile); setError(""); }

  return <div className="app-shell">
    <header className="site-header"><div className="header-inner"><Brand onClick={job ? goHome : undefined} label={t.backHome} /><div className="header-actions">
      <span className="privacy-pill"><i />{t.privacy}</span>
      <button className="header-button" type="button" onClick={() => setLanguage(language === "en" ? "zh" : "en")}>{t.language}</button>
      <button className="header-button" type="button" onClick={() => setShowSettings(true)}><Glyph name="info" size={16} />{t.help}</button>
    </div></div></header>

    <main className="main-shell">
      {!job && <section className="landing-layout">
        <div className="hero-copy">
          <div className="hero-badge"><span />{t.badge}</div>
          <h1>{t.hero}</h1>
          <p>{t.intro}</p>
          <div className="feature-row">
            <div><Glyph name="frame" /><span><strong>{t.keyFrames}</strong><small>{t.keyFramesSub}</small></span></div>
            <div><Glyph name="voice" /><span><strong>{t.subtitles}</strong><small>{t.subtitlesSub}</small></span></div>
            <div><Glyph name="clock" /><span><strong>{t.cleanup}</strong><small>{t.cleanupSub}</small></span></div>
          </div>
        </div>

        <form className="capture-card" onSubmit={startAnalysis}>
          <div className="capture-card-head"><div><span>{t.newAnalysis}</span><h2>{t.startOne}</h2></div><img src="/koma-icon-64.png" alt="" /></div>
          <div className="mode-switch" role="tablist" aria-label={t.sourceLabel}>
            <button className={mode === "upload" ? "selected" : ""} type="button" onClick={() => setMode("upload")}><Glyph name="upload" size={15} />{t.upload}</button>
            <button className={mode === "url" ? "selected" : ""} type="button" onClick={() => setMode("url")}><Glyph name="link" size={15} />{t.videoUrl}</button>
          </div>
          {mode === "upload" ? <div className={`drop-zone ${file ? "has-file" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={(event: DragEvent) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }} role="button" tabIndex={0} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}>
            <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0])} />
            <span className="drop-icon"><Glyph name="upload" size={22} /></span><strong>{file ? file.name : t.drop}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${t.ready}` : t.fileHint}</small>
          </div> : <label className="url-field"><span><Glyph name="link" size={16} />{t.publicUrl}</span><input ref={urlInputRef} type="text" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder={t.urlPlaceholder} /><small>{t.urlHint}</small></label>}
          <div className="capture-foot"><span><i />{t.temporary}</span><button className="primary-button" type="submit" disabled={busy}>{busy ? (uploadPercent !== null ? `${t.uploading} ${uploadPercent}%` : t.starting) : t.start}<Glyph name="arrow" size={17} /></button></div>
          {uploadPercent !== null && <div className="upload-track" aria-label={`${t.uploadProgress}: ${uploadPercent}%`}><span style={{ width: `${uploadPercent}%` }} /></div>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </section>}
      {job && !hasResult && <ProgressView job={job} progress={progress} error={error} onClear={purgeJob} onRetry={retryAnalysis} language={language} />}
      {hasResult && <ResultView job={job} onClear={purgeJob} onRestart={restartAnalysis} language={language} />}
    </main>
    {showSettings && <InfoModal onClose={() => setShowSettings(false)} language={language} />}
  </div>;
}

function ProgressView({ job, progress, error, onClear, onRetry, language }: { job: Job; progress: number; error: string; onClear: () => void; onRetry: () => void; language: Language }) {
  const t = copy[language];
  const failed = job.status === "failed";
  return <section className="progress-layout"><div className="progress-copy"><span className="page-label">{job.source === "url" ? t.analyzingRemote : t.analyzingLocal}</span><h1>{t.progressTitle}</h1><p>{t.progressText}</p></div>
    <div className="progress-card"><div className="progress-mascot"><img src="/koma-icon.png" alt="" /></div><div className="progress-status"><span>{job.progress ? t.stage[job.progress.stage] || t.processing : t.processing}</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><p>{job.progress?.detail || t.preparing}</p>{(error || job.error) && <div className="inline-error" role="alert">{translateServerError(error || job.error, language)}</div>}<div className="process-list"><span className="done">{t.entered}</span><span className={progress >= 35 ? "done" : "current"}>{t.mediaAnalysis}</span><span className={progress >= 100 ? "done" : "waiting"}>{t.readableResult}</span></div>{failed ? <div className="retry-row"><button className="primary-button" type="button" onClick={onRetry}>{t.retry}<Glyph name="arrow" size={17} /></button><button className="text-button" type="button" onClick={onClear}>{t.cancel}</button></div> : <button className="text-button" type="button" onClick={onClear}>{t.cancel}</button>}</div>
  </section>;
}

function FitTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const element = ref.current; if (!element) return undefined; const fit = () => { const base = Number.parseFloat(getComputedStyle(element).fontSize) || 43; element.style.fontSize = ""; let size = base; while (size > 24 && element.scrollWidth > element.clientWidth) { size -= 1; element.style.fontSize = `${size}px`; } }; fit(); window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit); }, [children]);
  return <h1 ref={ref}>{children}</h1>;
}

function ResultView({ job, onClear, onRestart, language }: { job: Job; onClear: () => void; onRestart: () => void; language: Language }) {
  const t = copy[language]; const result = job.result as AnalysisResult;
  const [remaining, setRemaining] = useState(Math.max(0, job.expiresAt - Date.now())); const [selectedFrame, setSelectedFrame] = useState(0); const [currentMs, setCurrentMs] = useState(0); const [showSubtitles, setShowSubtitles] = useState(false); const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { const timer = window.setInterval(() => setRemaining(Math.max(0, job.expiresAt - Date.now())), 1000); return () => window.clearInterval(timer); }, [job.expiresAt]);
  // 结果页让浏览器标签页显示视频标题
  useEffect(() => {
    const previous = document.title;
    document.title = result.title || (language === "zh" ? "Koma — AI 视频理解" : "Koma — AI Video Understanding");
    return () => { document.title = previous; };
  }, [result.title, language]);
  const selected = result.frames[selectedFrame] || result.frames[0];
  useEffect(() => { setShowSubtitles(!result.hasSubtitles); }, [result.hasSubtitles]);
  const activeSubtitle = showSubtitles ? (result.transcript || []).find((line) => currentMs >= line.startMs && currentMs < line.endMs) : null;
  const countdown = `${Math.floor(remaining / 60000)}:${String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0")}`;
  function syncToTime(atMs: number, shouldPlay = true) { const targetMs = Math.min(result.durationMs || atMs, Math.max(0, Number(atMs) || 0)); const video = videoRef.current; const seek = () => { const element = videoRef.current; if (!element) return; element.currentTime = targetMs / 1000; if (shouldPlay) element.play().catch(() => undefined); }; if (video) { if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true }); } setCurrentMs(targetMs); setSelectedFrame(frameIndexAtTime(result.frames, targetMs)); }
  function followPlayback() { const nextMs = Math.round((videoRef.current?.currentTime || 0) * 1000); setCurrentMs(nextMs); setSelectedFrame(frameIndexAtTime(result.frames, nextMs)); }

  return <section className="result-layout"><div className="result-main">
    <div className="result-heading"><div className="result-title"><span className="page-label">{t.completed} · {formatDate(job.createdAt, language)}</span><FitTitle>{result.title || t.resultFallback}</FitTitle></div><div className="result-actions"><button className="restart-button" type="button" onClick={onRestart}><Glyph name="arrow" size={15} />{t.restart}</button><button className="clear-button" type="button" onClick={onClear}><Glyph name="trash" size={16} />{t.clear}</button></div></div>
    <div className="summary-block"><span><Glyph name="spark" size={15} />{t.aiSummary}</span><p>{result.summary}</p></div>
    <div className="stat-row"><div><span>{t.duration}</span><strong>{formatTime(result.durationMs)}</strong></div><div><span>{t.frames}</span><strong>{result.frames.length}</strong></div><div><span>{t.subtitleLines}</span><strong>{result.transcript.length}</strong></div><div><span>{t.autoDelete}</span><strong className="countdown">{countdown}</strong></div></div>
    <section className="tag-panel"><div className="section-heading"><span>{t.contentTags}</span><small>{t.jumpTag}</small></div><div className="tag-list">{(result.tags || []).map((tag) => <button type="button" className="tag-chip" key={`${tag.category}-${tag.label}`} onClick={() => syncToTime(tag.atMs)}><span>{tag.category}</span>{tag.label}<i>{formatTime(tag.atMs)}</i></button>)}</div></section>
    <div className="video-stage"><div className="video-stage-player"><video ref={videoRef} src={result.videoUrl} poster={result.frames[0]?.url} controls playsInline preload="metadata" onTimeUpdate={followPlayback} onSeeked={followPlayback}>{t.browserNoVideo}</video>{activeSubtitle && <div className="video-subtitle">{activeSubtitle.speaker != null && String(activeSubtitle.speaker).trim() ? <span>{t.speaker} {activeSubtitle.speaker}</span> : null}<p>{activeSubtitle.text}</p></div>}<button type="button" className={`cc-toggle ${showSubtitles ? "on" : ""}`} aria-pressed={showSubtitles} onClick={() => setShowSubtitles((value) => !value)} title={showSubtitles ? t.subtitlesOn : t.subtitlesOff}><Glyph name="cc" size={13} />{t.subtitlesToggle}</button></div><div className="video-stage-caption"><span>{selected?.caption || t.reviewing}</span><span>{formatTime(currentMs)} / {formatTime(result.durationMs)}</span></div></div>
    <div className="frame-strip" aria-label={t.frameTimeline}>{result.frames.map((frame, index) => <button key={frame.url} type="button" aria-label={`${t.jumpTo} ${formatTime(frame.atMs)}: ${frame.caption || t.keyFrame}`} className={index === selectedFrame ? "active" : ""} onClick={() => syncToTime(frame.atMs)}><img src={frame.url} alt="" /><span>{formatTime(frame.atMs)}</span></button>)}</div>
    <section className="chapters"><div className="section-heading"><span>{t.chapters}</span><small>{result.chapters.length ? `${result.chapters.length} ${t.chaptersCount} · ${t.chaptersSub}` : ""}</small></div>{result.chapters.length ? <div className="chapter-list">{(result.chapters || []).map((chapter, index) => <button type="button" className="chapter" key={`${chapter.startMs}-${index}`} onClick={() => syncToTime(chapter.startMs)}><span className="chapter-rail"><strong>{index + 1}</strong><i>{formatTime(chapter.startMs)} – {formatTime(chapter.endMs)}</i></span><span className="chapter-body"><strong>{chapter.title}</strong><p>{chapter.summary}</p></span><Glyph name="arrow" size={18} /></button>)}</div> : <div className="chapter-empty">{t.noChapters}</div>}</section>
  </div>
  <aside className="transcript-panel"><div className="panel-heading"><div><span className="page-label">SUBTITLES</span><h2>{t.subtitlePanel}</h2><p>{t.subtitlePanelText}</p></div><span className="live-dot" /></div><div className="transcript-list">{result.transcript.length ? result.transcript.map((line, index) => { const active = currentMs >= line.startMs && currentMs < line.endMs; const speaker = line.speaker != null && String(line.speaker).trim() ? `${t.speaker} ${line.speaker}` : t.voice; return <button type="button" className={`transcript-line ${active ? "active" : ""}`} aria-pressed={active} key={`${line.startMs}-${index}`} onClick={() => syncToTime(line.startMs)}><span className="line-rail"><strong>{formatTime(line.startMs)}</strong><i>{formatTime(line.endMs)}</i></span><span className="line-body"><small><i />{speaker}</small><p>{line.text}</p><em><Glyph name="play" size={11} />{t.playFrom} {formatTime(line.startMs)}</em></span></button>; }) : <div className="transcript-empty">{t.noSpeech}</div>}</div><div className="panel-note"><Glyph name="clock" size={14} />{Math.ceil(remaining / 60000)} {t.remaining}</div></aside>
  </section>;
}

function frameIndexAtTime(frames: Frame[], atMs: number): number { let nearest = 0; for (let index = 0; index < frames.length; index += 1) { if (frames[index].atMs > atMs) break; nearest = index; } return nearest; }

function InfoModal({ onClose, language }: { onClose: () => void; language: Language }) {
  const t = copy[language];
  const closeRef = useRef<HTMLButtonElement>(null);
  // onClose 是父组件内联箭头函数，每次渲染引用都会变；
  // 用 ref 存最新值，effect 只在挂载时跑一次（聚焦 + 监听 Escape），
  // 避免父组件重渲染时焦点被反复抢回关闭按钮。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(event) => event.stopPropagation()}><button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label={t.close}>×</button><img src="/koma-icon-64.png" alt="" /><span className="page-label">ABOUT KOMA</span><h2 id="info-title">{t.aboutTitle}</h2><p>{t.aboutText}</p><p className="modal-muted">{t.aboutMuted}</p><button className="primary-button" type="button" onClick={onClose}>{t.gotIt}<Glyph name="arrow" size={17} /></button></div></div>;
}

export default App;
